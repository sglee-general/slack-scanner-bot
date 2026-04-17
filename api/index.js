export default async function handler(req, res) {
  try {
    const userId = req.body.user_id;
    const userName = req.body.user_name;

    // 🔥 테스트용 (처음엔 시트 없이)
    return res.status(200).json({
      response_type: "ephemeral",
      text: `✅ 연결 성공 (${userName})`
    });

  } catch (err) {
    return res.status(200).json({
      response_type: "ephemeral",
      text: "❌ 서버 오류"
    });
  }
}
