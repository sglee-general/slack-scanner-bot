const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 슬랙 명령어(/스캔)는 body가 문자열로 올 수 있어 파싱이 필요할 수 있습니다.
  const body = req.body;

  // 1. 슬랙 서버 검증
  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  // 2. 홈 탭 열기 이벤트 처리
  if (body.event && body.event.type === 'app_home_opened') {
    await publishHomeView(body.event.user);
    return res.status(200).send("");
  }

  // 3. 슬래시 명령어 처리 (/스캔)
  // 슬랙은 명령어 데이터를 'command'라는 필드로 보냅니다.
  if (body.command === '/스캔') {
    const userId = body.user_id;
    const userName = body.user_name;
    
    const result = await getScanLink(userId, userName);
    
    // 명령어에 대한 응답은 res.json으로 직접 던지는게 가장 빠르고 정확합니다.
    return res.status(200).json({
      response_type: "ephemeral",
      text: result.text,
      attachments: result.attachments
    });
  }

  return res.status(200).send("");
}

// [로직 보존] 구글 시트 조회 및 링크 생성
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

    // ID 또는 이름으로 검색 (Slack ID 우선)
    const userRow = rows.find(row => 
      (row.get('Slack ID') && row.get('Slack ID').toString() === userId) || 
      (row.get('이름') && row.get('이름').toString() === userName)
    );

    if (!userRow) return { text: `⚠️ ${userName || userId}님 정보를 찾을 수 없습니다.`, url: null };

    const boxId = String(userRow.get('박스번호')).padStart(3, '0');
    const zone = userRow.get('구역');
    const ip = SCANNER_IPS[zone];
    const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
    const finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;

    return {
      text: `📂 *${zone.replace('-', '층 ')}구역* 스캔함 연결`,
      url: finalUrl,
      attachments: [{
        color: "#36a64f",
        blocks: [{
          type: "section",
          text: { type: "mrkdwn", text: `안녕하세요 *${userName || userId}*님! *${boxId}번* 박스로 연결됩니다.` },
          accessory: { type: "button", text: { type: "plain_text", text: "목록 열기" }, url: finalUrl, style: "primary" }
        }]
      }]
    };
  } catch (error) {
    return { text: "❌ 시트 조회 오류: " + error.message, url: null };
  }
}

// 홈 탭 게시
async function publishHomeView(userId) {
  const result = await getScanLink(userId, "");

  const homeView = {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚀 스캔 도우미 홈" } },
      { type: "section", text: { type: "mrkdwn", text: result.url ? `현재 연결된 스캔함: *${result.text}*` : "⚠️ 정보를 불러오려면 `/스캔`을 한 번 실행하거나 관리자에게 문의하세요." } },
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
