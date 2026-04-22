const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const axios = require('axios');

const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 1. 슬랙 서버 검증 (최초 1회 실행용)
  if (req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // 2. [Interactivity] 홈 탭 버튼 클릭 처리
  if (req.body.payload) {
    const payload = JSON.parse(req.body.payload);
    
    // 버튼 클릭 즉시 200 응답 (슬랙 타임아웃 방지)
    res.status(200).send(""); 

    if (payload.actions && payload.actions[0].action_id === 'run_scan_action') {
      // 버튼 클릭 시 시트 로직 실행 (response_url을 통해 결과 전송)
      await processScanRequest(payload.user.id, payload.user.name, payload.response_url);
    }
    return;
  }

  // 3. [Events] 홈 탭 열기 (화면 그리기)
  if (req.body.event && req.body.event.type === 'app_home_opened') {
    await publishHomeView(req.body.event.user);
    return res.status(200).send("");
  }

  // 4. [Command] 슬래시 명령어 처리 (/스캔)
  if (req.body.command === '/스캔') {
    const { user_id, user_name, response_url } = req.body;
    // 명령어 처리 시에도 시트 로직 실행
    await processScanRequest(user_id, user_name, response_url);
    return res.status(200).send(""); 
  }
}

// 구글 시트 연동 및 결과 전송 통합 함수
async function processScanRequest(userId, userName, responseUrl) {
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

    // 슬랙 ID 또는 이름으로 행 찾기
    const userRow = rows.find(row => 
      (row.get('Slack ID') && row.get('Slack ID').toString() === userId) || 
      (row.get('이름') && row.get('이름').toString() === userName)
    );
    
    if (!userRow) {
      return await sendSlackMessage(responseUrl, `⚠️ ${userName}님 정보를 찾을 수 없습니다.`);
    }

    const boxId = String(userRow.get('박스번호')).padStart(3, '0');
    const zone = userRow.get('구역');
    const ip = SCANNER_IPS[zone];
    
    if (!ip) return await sendSlackMessage(responseUrl, `⚠️ ${zone} 구역의 IP 정보가 없습니다.`);

    const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
    const finalUrl = `http://${ip}/apps/box/index.html#opt/${encodeURIComponent(JSON.stringify(urlObj))}/hashBoxFileList/hashBoxList`;

    await sendSlackMessage(responseUrl, `📂 *${zone.replace('-', '층 ')}구역* 스캔함 연결`, [
      {
        color: "#36a64f",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `안녕하세요 *${userName}*님! *${boxId}번* 박스로 연결됩니다.` } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "🚀 내 파일 목록 열기" }, "url": finalUrl, "style": "primary" }] }
        ]
      }
    ]);
  } catch (error) {
    console.error("처리 중 오류:", error);
    await sendSlackMessage(responseUrl, "❌ 서버 오류: " + error.message);
  }
}

// 슬랙 메시지 전송 유틸리티
async function sendSlackMessage(url, text, attachments = []) {
  if (!url) return;
  await axios.post(url, { response_type: "ephemeral", text, attachments });
}

// 홈 탭 그리기 유틸리티
async function publishHomeView(userId) {
  const homeView = {
    type: "home",
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🚀 스캔 도우미 홈" } },
      { type: "section", text: { type: "mrkdwn", text: "안녕하세요! 이제 홈 탭에서도 편리하게 스캔함을 이용하세요." } },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "*명령어를 잊으셨나요?*\n아래 버튼을 누르면 팀장님의 스캔함 링크를 즉시 보내드립니다." } },
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

  await axios.post('https://slack.com/api/views.publish', {
    user_id: userId,
    view: homeView
  }, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
  });
}
