const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 1. 슬랙 서버 검증
  if (req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // 2. 버튼 클릭(Interactivity) 처리
  if (req.body.payload) {
    const payload = JSON.parse(req.body.payload);
    
    if (payload.actions && payload.actions[0].action_id === 'run_scan_action') {
      // [수정] 즉시 응답하지 않고, 로직이 끝날 때까지 기다립니다.
      const result = await processScanRequest(payload.user.id, payload.user.name);
      return res.status(200).json(result); // 슬랙 버튼에 대한 직접 응답으로 메시지 전송
    }
    return res.status(200).send("");
  }

  // 3. 홈 탭 열기
  if (req.body.event && req.body.event.type === 'app_home_opened') {
    await publishHomeView(req.body.event.user);
    return res.status(200).send("");
  }

  // 4. 슬래시 명령어 처리 (/스캔)
  if (req.body.command === '/스캔') {
    const { user_id, user_name } = req.body;
    const result = await processScanRequest(user_id, user_name);
    return res.status(200).json(result); // 명령어에 대한 직접 응답
  }
}

async function processScanRequest(userId, userName) {
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
    
    if (!userRow) return { text: `⚠️ ${userName}님 정보를 찾을 수 없습니다.` };

    const boxId = String(userRow.get('박스번호')).padStart(3, '0');
    const zone = userRow.get('구역');
    const ip = SCANNER_IPS[zone];
    const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
    const finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;

    // 명령어와 버튼 클릭 모두에 사용할 수 있는 공통 응답 형식
    return {
      response_type: "ephemeral",
      text: `📂 *${zone.replace('-', '층 ')}구역* 스캔함 연결`,
      attachments: [{
        color: "#36a64f",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `안녕하세요 *${userName}*님! *${boxId}번* 박스로 연결됩니다.` } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "🚀 내 파일 목록 열기" }, "url": finalUrl, "style": "primary" }] }
        ]
      }]
    };
  } catch (error) {
    return { text: "❌ 서버 오류: " + error.message };
  }
}

async function publishHomeView(userId) {
  const homeView = {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚀 스캔 도우미 홈" } },
      { type: "section", text: { type: "mrkdwn", text: "버튼을 누르면 팀장님의 스캔 폴더 링크를 보내드립니다." } },
      { 
        type: "actions", 
        elements: [{ 
          type: "button", 
          text: { type: "plain_text", text: "📂 내 스캔 폴더 연결하기" }, 
          action_id: "run_scan_action", 
          style: "primary"
        }] 
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
