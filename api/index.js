const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SCANNER_IPS = {
  "4-1": "192.168.0.231", "4-2": "192.168.0.251",
  "7-1": "192.168.0.250", "7-2": "192.168.0.230",
  "14-1": "192.168.0.252", "14-2": "192.168.0.253"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { user_id, user_name } = req.body;

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

    // 1. 사용자 찾기 (Slack ID 또는 이름으로 검색)
    const userRow = rows.find(row => 
      (row.get('Slack ID') && row.get('Slack ID').toString() === user_id) || 
      (row.get('이름') && row.get('이름').toString() === user_name)
    );
    
    if (!userRow) {
      return res.json({ text: `⚠️ ${user_name}님 정보를 시트에서 찾을 수 없습니다.` });
    }

    // 2. 시트에서 직접 박스번호와 구역 정보 가져오기
    const boxIdRaw = userRow.get('박스번호');
    const zoneRaw = userRow.get('구역'); // 시트의 '구역' 열에서 4-1 등을 읽어옴

    if (!boxIdRaw || !zoneRaw) {
      return res.json({ text: `⚠️ 시트의 '박스번호' 또는 '구역' 정보가 비어있습니다.` });
    }

    const boxId = String(boxIdRaw).padStart(3, '0');
    const ip = SCANNER_IPS[zoneRaw]; // 시트에 적힌 구역에 맞는 IP 선택

    if (!ip) {
      return res.json({ text: `⚠️ 시트에 적힌 구역(${zoneRaw})에 해당하는 스캐너 IP가 없습니다.` });
    }

    // 3. 링크 생성
    const urlObj = { "data": {"appId": "appId.std.box", "subId": "box"}, "boxNumStr": boxId };
    const encoded = encodeURIComponent(JSON.stringify(urlObj));
    const finalUrl = `http://${ip}/apps/box/index.html#opt/${encoded}/hashBoxFileList/hashBoxList`;

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
