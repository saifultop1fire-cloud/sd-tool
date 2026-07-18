const https = require("https");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { image } = JSON.parse(event.body);
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const bodyParams = new URLSearchParams();
    bodyParams.append("image_file_b64", base64Data);
    bodyParams.append("size", "auto");
    const bodyStr = bodyParams.toString();

    const responseData = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.remove.bg",
        path: "/v1.0/removebg",
        method: "POST",
        headers: {
          "X-Api-Key": "gUYnLj9cgpFzKE5HXhWKkDqD",
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(bodyStr)
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errText = "";
          res.on("data", (chunk) => errText += chunk);
          res.on("end", () => reject(new Error(`RemoveBg HTTP: ${res.statusCode} - ${errText}`)));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });

      req.on("error", (e) => reject(e));
      req.write(bodyStr);
      req.end();
    });

    const base64Output = responseData.toString("base64");

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ image: `data:image/png;base64,${base64Output}` })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ image: `data:image/png;base64,${base64Output}` })
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
