const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  if (req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // 1. 홈 탭 열기 이벤트 처리 (여기서 링크를 미리 만듭니다)
  if (req.body.event && req.body.event.type === 'app_home_opened') {
    await publishHomeView(req.body.event.user);
    return res.status(200).send("");
  }

  // 2. 명령어 처리 (/스캔)
  if (req.body.command === '/스캔') {
    const { user_id, user_name, response_url } = req.body;
    const result = await getScanLink(user_id, user_name);
    
    await fetch(response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: "ephemeral",
        text: result.text,
        attachments: result.attachments
      })
    });
    return res.status(200).send("");
  }

  return res.status(200).send("");
}

// [공통 로직] 구글 시트에서 정보를 가져와 링크 정보를 생성하는 함수
async function getScanLink(userId, userName) {
  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const userRow = rows.find(row => 
      (row.get('Slack ID') && row.get('Slack ID').toString() === userId) || 
      (row.get('이름') && row.get('이름').toString() === userName)
    );

    if (!userRow) return { text: `⚠️ 정보를 찾을 수 없습니다.`, url: null };

    const boxId = String(userRow.get('박스번호')).padStart(3, '0');
    const zone = userRow.get('구역');
    const ip = SCANNER_IPS[zone];
    const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
    const finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;

    return {
      text: `📂 *${zone.replace('-', '층 ')}구역* 스캔함 (${boxId}번)`,
      url: finalUrl,
      attachments: [{
        color: "#36a64f",
        blocks: [{
          type: "section",
          text: { type: "mrkdwn", text: `안녕하세요 *${userName}*님! *${boxId}번* 박스로 연결됩니다.` },
          accessory: { type: "button", text: { type: "plain_text", text: "목록 열기" }, url: finalUrl, style: "primary" }
        }]
      }]
    };
  } catch (error) {
    return { text: "❌ 에러: " + error.message, url: null };
  }
}

// 홈 탭 게시 함수 (사용자 정보를 조회해서 버튼에 URL을 직접 심음)
async function publishHomeView(userId) {
  // 사용자의 이름을 알기 위해 슬랙 API 호출 (선택 사항이나 정확도를 위해 권장)
  // 여기서는 일단 시트 로직으로 바로 연결을 시도합니다.
  const result = await getScanLink(userId, "");

  const homeView = {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚀 스캔 도우미 홈" } },
      { type: "section", text: { type: "mrkdwn", text: result.url ? `현재 연결된 스캔함: *${result.text}*` : "스캔 정보를 불러올 수 없습니다." } },
      { 
        type: "actions", 
        elements: [
          { 
            type: "button", 
            text: { type: "plain_text", text: "📂 내 스캔 폴더 바로 열기" }, 
            url: result.url || "https://slack.com", // 링크가 없으면 기본값
            style: "primary"
          }
        ] 
      },
      { type: "context", elements: [{ type: "mrkdwn", text: "💡 정보가 다르다면 구글 시트 등록 정보를 확인하세요." }] }
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
