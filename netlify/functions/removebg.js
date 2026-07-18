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

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": "gUYnLj9cgpFzKE5HXhWKkDqD",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams
    });

    if (!response.ok) {
      const errText = await response.text();
      return { statusCode: response.status, headers, body: JSON.stringify({ error: errText }) };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Output = Buffer.from(arrayBuffer).toString("base64");

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ image: `data:image/png;base64,${base64Output}` })
    };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
