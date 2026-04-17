const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  // 슬랙에서 보낸 데이터 받기
  const { user_id, user_name, command } = req.body;

  // 1. 구역 판별
  let zone = "4-1";
  if (command.includes("4-2")) zone = "4-2";
  else if (command.includes("7-1")) zone = "7-1";
  else if (command.includes("7-2")) zone = "7-2";
  else if (command.includes("14-1")) zone = "14-1";
  else if (command.includes("14-2")) zone = "14-2";

  try {
    // 2. 구글 시트 연결 (Vercel 환경변수 사용)
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    // 3. 사용자 찾기
    const userRow = rows.find(row => row.get('Slack ID') === user_id || row.get('성함/사번') === user_name);
    const boxId = userRow ? userRow.get('박스 번호').padStart(3, '0') : null;

    if (!boxId) {
      return res.json({ text: `⚠️ ${user_name}님은 등록되지 않았습니다.` });
    }

    // 4. 링크 생성
    const ip = SCANNER_IPS[zone];
    const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
    const encoded = encodeURIComponent(JSON.stringify(urlObj));
    const finalUrl = `http://${ip}/apps/box/index.html#opt/${encoded}/hashBoxFileList/hashBoxList`;

    // 5. 슬랙에 전송 (Vercel은 속도가 빨라서 바로 응답해도 reason이 안 뜹니다!)
    return res.json({
      response_type: "in_channel",
      text: `📂 *${zone.replace('-', '층 ')}구역* 스캔함 연결`,
      attachments: [{
        color: "#36a64f",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `안녕하세요 *${user_name}*님! *${boxId}번* 박스로 연결됩니다.` } },
          { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "🚀 내 파일 목록 열기" }, "url": finalUrl, "style": "primary" }] }
        ]
      }]
    });

  } catch (error) {
    return res.json({ text: "❌ 오류 발생: " + error.message });
  }
}
