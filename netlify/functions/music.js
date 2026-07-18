const crypto = require("crypto");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  try {
    const { prompt } = JSON.parse(event.body);

    const hfResponse = await fetch("https://api-inference.huggingface.co/models/facebook/musicgen-small", {
      method: "POST",
      headers: {
        "Authorization": "Bearer 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",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        options: { wait_for_model: true }
      })
    });

    if (!hfResponse.ok) {
      const errText = await hfResponse.text();
      return { statusCode: hfResponse.status, headers, body: JSON.stringify({ error: `HF Error: ${errText}` }) };
    }

    const audioBuffer = await hfResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    const fileDataUri = `data:audio/wav;base64,${base64Audio}`;

    const cloudName = "dp2fkubbd";
    const apiKey = "812228737222237";
    const apiSecret = "LCXD86YMtVDJBJ5_7vrJ3IAEMtM";
    const uploadPreset = "SDCHAT";
    const timestamp = Math.round((new Date()).getTime() / 1000);

    const signatureString = `timestamp=${timestamp}&upload_preset=${uploadPreset}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureString).digest("hex");

    const cloudinaryBody = new URLSearchParams();
    cloudinaryBody.append("file", fileDataUri);
    cloudinaryBody.append("upload_preset", uploadPreset);
    cloudinaryBody.append("timestamp", timestamp.toString());
    cloudinaryBody.append("api_key", apiKey);
    cloudinaryBody.append("signature", signature);

    const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
      method: "POST",
      body: cloudinaryBody
    });

    const cloudinaryData = await cloudinaryResponse.json();
    if (cloudinaryData.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: cloudinaryData.error.message }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: cloudinaryData.secure_url,
        duration: Math.round(cloudinaryData.duration || 15)
      })
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
