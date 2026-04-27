import querystring from 'querystring';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// 🔹 [복구] 기존 IP 매핑 정보
const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // [복구] Slack 요청 파싱 (JSON + form 둘 다 대응)
  let body = req.body;
  if (typeof body === 'string') {
    body = querystring.parse(body);
  }
  if (!body.command && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    body = querystring.parse(req.body);
  }

  // 🔹 [복구] URL 검증
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 🔹 [복구] 홈탭 이벤트
  if (body.event && body.event.type === 'app_home_opened') {
    await publishHomeView(body.event.user);
    return res.status(200).send("");
  }

  // 🔹 [복구] 슬래시 명령어 (/스캔)
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

// 🔥 [복구 및 수정] 시트 조회 + 링크 생성
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
      return {
        text: `⚠️ ${userName}님 정보 없음`,
        blocks: []
      };
    }

    const boxId = String(userRow.get('박스번호')).padStart(3, '0');
    const zone = userRow.get('구역');
    const ip = SCANNER_IPS[zone];

    if (!ip) {
      return {
        text: `⚠️ 구역 오류 (${zone})`,
        blocks: []
      };
    }

    // 🚀 [7-1 구역 C2265 전용 링크 수정 로직]
    let finalUrl = "";
    if (ip === "192.168.0.250") {
      // 7-1 기종은 hashPath(/hashBoxFileList...)가 붙으면 세션 충돌로 에러가 납니다.
      // 또한 boxNumStr이 data 상자 안에 포함되어야 안정적으로 인식합니다.
      const urlObj7 = {
        data: { 
          appId: "appId.std.box", 
          subId: "box", 
          boxNumStr: boxId 
        }
      };
      finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj7))}`;
    } else {
      // [원본 유지] 다른 층 기기 주소
      const urlObj = {
        data: { appId: "appId.std.box", subId: "box" },
        boxNumStr: boxId
      };
      finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;
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
            text: `*${userName}님*\n${boxId}번 스캔 박스로 이동합니다.`
          }
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "🚀 열기"
              },
              url: finalUrl,
              style: "primary"
            }
          ]
        }
      ]
    };

  } catch (error) {
    return {
      text: "❌ 시트 조회 오류",
      blocks: []
    };
  }
}

// 🔹 [복구] 홈탭 구성 (원본 가이드 텍스트 100% 동일)
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
      {
        type: "divider"
      },
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
