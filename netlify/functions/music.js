const https = require("https");
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

    // ১. হাগিংফ্যাস কল (HTTPS)
    const hfDataStr = JSON.stringify({
      inputs: prompt,
      options: { wait_for_model: true }
    });

    const audioBuffer = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api-inference.huggingface.co",
        path: "/models/facebook/musicgen-small",
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(hfDataStr)
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errText = "";
          res.on("data", (chunk) => errText += chunk);
          res.on("end", () => reject(new Error(`HuggingFace HTTP: ${res.statusCode} - ${errText}`)));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });

      req.on("error", (e) => reject(e));
      req.write(hfDataStr);
      req.end();
    });

    // ২. ক্লাউডিনারি আপলোড (HTTPS)
    const base64Audio = audioBuffer.toString("base64");
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
    const bodyStr = cloudinaryBody.toString();

    const cloudinaryData = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.cloudinary.com",
        path: `/v1_1/${cloudName}/video/upload`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(bodyStr)
        }
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => body += chunk);
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Cloudinary JSON error: ${body}`));
          }
        });
      });

      req.on("error", (e) => reject(e));
      req.write(bodyStr);
      req.end();
    });

    if (cloudinaryData.error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: cloudinaryData.error.message })
      };
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};    const cloudName = "dp2fkubbd";
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
