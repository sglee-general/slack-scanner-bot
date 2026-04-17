import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

async function getUser(userId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "1fAc-midGDQf2aPVavhUdGTBaN5GFvh5YZDiymV2fcVQ",
    range: "Sheet1!A:D",
  });

  const rows = res.data.values;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === userId) {
      return {
        name: rows[i][1],
        boxId: rows[i][2],
        zone: rows[i][3],
      };
    }
  }
  return null;
}
