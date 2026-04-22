const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // --- 1. 슬랙 이벤트 처리 (홈 탭 열기 등) ---
  if (req.body.event) {
    const event = req.body.event;

    // 슬랙 서버 연결 확인용 (처음 한 번만 실행됨)
    if (req.body.type === 'url_verification') {
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // 홈 탭이 열렸을 때 화면 그려주기
    if (event.type === 'app_home_opened') {
      await publishHomeView(event.user);
      return res.status(200).send("");
    }
    return res.status(200).send("");
  }

  // --- 2. 슬랙 명령어 처리 (/스캔) ---
  const { user_id, user_name, command } = req.body;
  
  if (command) {
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
        (row.get('Slack ID') && row.get('Slack ID').toString() === user_id) || 
        (row.get('이름') && row.get('이름').toString() === user_name)
      );
      
      if (!userRow) return res.json({ text: `⚠️ ${user_name}님 정보를 찾을 수 없습니다.` });

      const boxIdRaw = userRow.get('박스번호');
      const zoneRaw = userRow.get('구역');
      if (!boxIdRaw || !zoneRaw) return res.json({ text: "⚠️ 시트 정보가 비어있습니다." });

      const boxId = String(boxIdRaw).padStart(3, '0');
      const ip = SCANNER_IPS[zoneRaw];
      const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
      const finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;

      return res.json({
        response_type: "ephemeral",
        text: `📂 *${zoneRaw.replace('-', '층 ')}구역* 스캔함 연결`,
        attachments: [{
          color: "#36a64f",
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `안녕하세요 *${user_name}*님! *${boxId}번* 박스로 연결됩니다.` } },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "🚀 내 파일 목록 열기" }, "url": finalUrl, "style": "primary" }] }
          ]
        }]
      });
    } catch (error) {
      return res.json({ text: "❌ 서버 오류: " + error.message });
    }
  }
}

// 홈 탭 화면 디자인 함수
async function publishHomeView(userId) {
  const homeView = {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚀 스캔 도우미 홈" } },
      { type: "section", text: { type: "mrkdwn", text: "안녕하세요! 비나우 스캔 도우미입니다.\n이제 홈 탭에서도 편리하게 스캔함을 이용하세요." } },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "*명령어를 잊으셨나요?*\n채널 어디서든 `/스캔`을 입력하거나, 아래 가이드를 확인하세요." } },
      { 
        type: "actions", 
        elements: [{ 
          type: "button", 
          text: { type: "plain_text", text: "📂 내 스캔 폴더 연결하기" }, 
          url: "slack://run-slash-command?command=%2F%EC%8A%A4%EC%BA%94", // 클릭 시 /스캔 자동 실행
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
