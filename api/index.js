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
    console.log("📍 [1단계] 버튼 신호 수신됨. Action ID:", payload.actions[0].action_id);
    
    res.status(200).send(""); // 3초 타임아웃 방지 (즉시 응답)

    // [체크!] 버튼의 action_id가 'run_scan_action'인지 확인
    if (payload.actions[0].action_id === 'run_scan_action') {
      console.log("📍 [2단계] 시트 로직 시작. 사용자:", payload.user.name);
      await processScanRequest(payload.user.id, payload.user.name, payload.response_url);
    }
    return;
  }

  // 3. 홈 탭 열기 이벤트
  if (req.body.event && req.body.event.type === 'app_home_opened') {
    console.log("📍 홈 탭 열림 감지");
    await publishHomeView(req.body.event.user);
    return res.status(200).send("");
  }

  // 4. 슬래시 명령어 처리 (/스캔)
  if (req.body.command === '/스캔') {
    console.log("📍 명령어 /스캔 수신");
    const { user_id, user_name, response_url } = req.body;
    await processScanRequest(user_id, user_name, response_url);
    return res.status(200).send("");
  }
}

async function processScanRequest(userId, userName, responseUrl) {
  try {
    console.log("📍 [3단계] 구글 시트 연결 중...");
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
    
    if (!userRow) {
      console.log("❌ 사용자 찾지 못함");
      return await sendSlackMessage(responseUrl, `⚠️ ${userName}님 정보를 찾을 수 없습니다.`);
    }

    const boxId = String(userRow.get('박스번호')).padStart(3, '0');
    const zone = userRow.get('구역');
    const ip = SCANNER_IPS[zone];
    const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
    const finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;

    console.log("📍 [4단계] 메시지 전송 시도 중...");
    await sendSlackMessage(responseUrl, `📂 *${zone.replace('-', '층 ')}구역* 스캔함 연결`, [
      {
        color: "#36a64f",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `안녕하세요 *${userName}*님! *${boxId}번* 박스로 연결됩니다.` } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "🚀 내 파일 목록 열기" }, "url": finalUrl, "style": "primary" }] }
        ]
      }
    ]);
    console.log("✅ [완료] 메시지 전송 성공!");
  } catch (error) {
    console.error("❌ 에러 발생:", error.message);
    await sendSlackMessage(responseUrl, "❌ 서버 오류: " + error.message);
  }
}

async function sendSlackMessage(url, text, attachments = []) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: "ephemeral", text, attachments })
  });
}

async function publishHomeView(userId) {
  const homeView = {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚀 스캔 도우미 홈" } },
      { type: "section", text: { type: "mrkdwn", text: "안녕하세요! 아래 버튼을 누르면 스캔 폴더를 연결해 드립니다." } },
      { 
        type: "actions", 
        elements: [{ 
          type: "button", 
          text: { type: "plain_text", text: "📂 내 스캔 폴더 연결하기" }, 
          action_id: "run_scan_action", // 이 ID가 서버 코드와 일치해야 함
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
