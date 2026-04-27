import querystring from 'querystring';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// 🔹 [원본 복구] 기기 타입 설정 (7-1은 legacy로 유지하여 메인 접속 유도)
const SCANNER_CONFIG = {
  "4-1": { ip: "192.168.0.231", type: "new" },
  "4-2": { ip: "192.168.0.251", type: "new" },
  "7-1": { ip: "192.168.0.250", type: "legacy" }, // 👈 7층 1구역 (C2265)
  "7-2": { ip: "192.168.0.230", type: "new" },
  "14-1": { ip: "192.168.0.252", type: "new" },
  "14-2": { ip: "192.168.0.253", type: "new" }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // [원본 복구] Slack 요청 파싱
  let body = req.body;
  if (typeof body === 'string') {
    body = querystring.parse(body);
  }
  if (!body.command && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    body = querystring.parse(req.body);
  }

  // 🔹 [원본 복구] URL 검증
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 🔹 [원본 복구] 홈탭 이벤트
  if (body.event && body.event.type === 'app_home_opened') {
    await publishHomeView(body.event.user);
    return res.status(200).send("");
  }

  // 🔹 [원본 복구] 슬래시 명령어 (/스캔)
  if (body.command === '/스캔') {
    const userId = body.user_id;
    const userName = body.user_name;
    const result = await getScanLink(userId, userName);

    return res.status(200).json({
      response_type: "ephemeral",
      text: result.text,
      blocks: result.blocks
    });
  }

  return res.status(200).send("");
}

// 🔥 [원본 복구 및 안내 문구 수정] 시트 조회 + 링크 생성
async function getScanLink(userId, userName) {
  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const userRow = rows.find(row =>
      (row.get('Slack ID') && row.get('Slack ID').toString() === userId)
    );

    if (!userRow) {
      return { text: `⚠️ ${userName}님 정보 없음`, blocks: [] };
    }

    const boxId = String(userRow.get('박스번호')).padStart(3, '0');
    const zone = userRow.get('구역');
    const config = SCANNER_CONFIG[zone];

    if (!config) {
      return { text: `⚠️ 구역 오류 (${zone})`, blocks: [] };
    }

    let finalUrl = "";
    let btnText = "🚀 바로 열기";

    // 🚀 [7-1 구역] 보안상 메인 화면으로 연결하되, 문구 최적화
    if (config.type === "legacy") {
      finalUrl = `http://${config.ip}/scan.htm`;
      btnText = "📂 스캔 목록 열기";
    } else {
      // 다른 층 최신 기종용 직통 링크
      const urlObj = {
        data: { appId: "appId.std.box", subId: "box" },
        boxNumStr: boxId
      };
      finalUrl = `http://${config.ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;
    }

    return {
      text: `📂 ${zone.replace('-', '층 ')}구역 스캔함`,
      url: finalUrl,
      zone,
      boxId,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${userName}님 스캔함 정보*\n📍 구역: *${zone.replace('-', '층 ')}*\n🔑 박스 번호: *${boxId}번*`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: btnText },
              url: finalUrl,
              style: "primary"
            }
          ]
        },
        // 🔥 [팀장님 요청 문구 적용] 7-1 유저 전용 안내
        ...(config.type === "legacy" ? [{
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `7층 1구역 복합기는 메일함에서 직접 *${boxId}번*을 클릭하셔야 합니다.`
          }]
        }] : [])
      ]
    };

  } catch (error) {
    return { text: "❌ 시트 조회 오류", blocks: [] };
  }
}

// 🔹 [원본 복구] 홈탭 구성
async function publishHomeView(userId) {
  const result = await getScanLink(userId, "");

  const homeView = {
    type: "home",
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚀 스캔 도우미" }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
`안녕하세요 👋  
이 앱은 사내 복합기에서 스캔한 파일을 *내 개인 스캔 폴더로 바로 연결*해주는 도우미입니다.

📌 *이용 방법*
• 복합기에서 스캔 실행  
• 아래 버튼 클릭  
• 내 전용 스캔함으로 즉시 이동

🏢 *지원 구역*
4층 / 7층 / 14층 복합기 스캔함 자동 연결

⚡ *Tip*
슬랙에서 \`/스캔\` 명령어를 입력해도 동일하게 이용할 수 있습니다`
        }
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: result.zone
            ? `현재 연결된 스캔함: *${result.zone.replace('-', '층 ')} / ${result.boxId}번*`
            : "⚠️ 사용자 정보를 불러올 수 없습니다"
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "📂 내 스캔 폴더 바로 열기" },
            url: result.url || "https://slack.com",
            style: "primary"
          }
        ]
      }
    ]
  };

  await fetch('https://slack.com/api/views.publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
    },
    body: JSON.stringify({ user_id: userId, view: homeView })
  });
}
