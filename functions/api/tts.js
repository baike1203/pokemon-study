// Cloudflare Pages Function: 同站点语音代理 /api/tts
// 作用：网站自己域名下直接代理 Edge-TTS，免跨域、免 workers.dev，平板最稳
// 用法：POST /api/tts  body={input, voice, speed}  ->  返回 audio/mpeg

const TOKEN_REFRESH_BEFORE_EXPIRY = 5 * 60;
let tokenInfo = { endpoint: null, token: null, expiredAt: null };

function generateUserIdFromDomain(requestUrl) {
  try {
    var url = new URL(requestUrl);
    var domain = url.hostname;
    var hash = 0;
    for (var i = 0; i < domain.length; i++) {
      hash = (hash << 5) - hash + domain.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0") + Math.abs(hash * 31).toString(16).padStart(8, "0");
  } catch (e) {
    return "0f04d16a175c411e";
  }
}

async function getEndpoint(request) {
  var now = Date.now() / 1000;
  if (tokenInfo.token && tokenInfo.expiredAt && now < tokenInfo.expiredAt - TOKEN_REFRESH_BEFORE_EXPIRY) {
    return tokenInfo.endpoint;
  }
  var endpointUrl = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
  var clientId = crypto.randomUUID().replace(/-/g, "");
  var userId = generateUserIdFromDomain(request.url);
  var lastError = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Accept-Language": "zh-Hans",
          "X-ClientVersion": "4.0.530a 5fe1dc6c",
          "X-UserId": userId,
          "X-HomeGeographicRegion": "zh-Hans-CN",
          "X-ClientTraceId": clientId,
          "X-MT-Signature": await sign(endpointUrl),
          "User-Agent": "okhttp/4.5.0",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": "0",
          "Accept-Encoding": "gzip",
        },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var jwt = JSON.parse(atob(data.t.split(".")[1]));
      tokenInfo = { endpoint: data, token: data.t, expiredAt: jwt.exp };
      return data;
    } catch (e) {
      lastError = e;
      if (attempt < 3) await new Promise(function (r) { setTimeout(r, 1000 * attempt); });
    }
  }
  if (tokenInfo.token) { tokenInfo.expiredAt = 0; return tokenInfo.endpoint; }
  throw new Error("Failed to get endpoint: " + (lastError ? lastError.message : "unknown"));
}

async function sign(urlStr) {
  var url = urlStr.split("://")[1];
  var encodedUrl = encodeURIComponent(url);
  var uuid = crypto.randomUUID().replace(/-/g, "");
  var date = new Date().toUTCString().replace(/GMT/, "").trim() + " GMT";
  var toSign = ("MSTranslatorAndroidApp" + encodedUrl + date + uuid).toLowerCase();
  var keyStr = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
  var keyBytes = Uint8Array.from(atob(keyStr), function (c) { return c.charCodeAt(0); });
  var cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(toSign)));
  var sig = btoa(String.fromCharCode.apply(null, sigBytes));
  return "MSTranslatorAndroidApp::" + sig + "::" + date + "::" + uuid;
}

async function getAudioChunk(text, voiceName, rate, pitch, request) {
  var endpoint = await getEndpoint(request);
  var url = "https://" + endpoint.r + ".tts.speech.microsoft.com/cognitiveservices/v1";
  var escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  var content = '<prosody rate="' + rate + '%" pitch="' + pitch + '%">' + escaped + "</prosody>";
  var ssml =
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="' +
    voiceName +
    '">' +
    content +
    "</voice></speak>";
  var res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: endpoint.t,
      "Content-Type": "application/ssml+xml",
      "User-Agent": "okhttp/4.5.0",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error("Edge TTS API error: " + res.status);
  return res.blob();
}

// SSML 直传：调用方已传合法 SSML 片段（如 <phoneme ...>），不转义、不按句切片，直接塞进 <prosody> 转发 Edge
async function getAudioChunkRaw(content, voiceName, rate, pitch, request) {
  var endpoint = await getEndpoint(request);
  var url = "https://" + endpoint.r + ".tts.speech.microsoft.com/cognitiveservices/v1";
  var ssml =
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="' +
    voiceName +
    '"><prosody rate="' + rate + '%" pitch="' + pitch + '%">' + content + "</prosody></voice></speak>";
  var res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: endpoint.t,
      "Content-Type": "application/ssml+xml",
      "User-Agent": "okhttp/4.5.0",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error("Edge TTS API error: " + res.status);
  return res.blob();
}

function splitTextIntoChunks(text, maxChunkSize) {
  var chunks = [];
  var sentenceBreaks = ["。", "！", "？", "；", "…", ".", "!", "?", "\n"];
  while (text.length > 0) {
    if (text.length <= maxChunkSize) { chunks.push(text); break; }
    var chunk = text.slice(0, maxChunkSize);
    var lastBreakIndex = -1;
    for (var i = chunk.length - 1; i >= Math.floor(maxChunkSize * 0.5); i--) {
      var found = false;
      for (var j = 0; j < sentenceBreaks.length; j++) {
        if (chunk[i] === sentenceBreaks[j]) { lastBreakIndex = i; found = true; break; }
      }
      if (found) break;
    }
    if (lastBreakIndex > 0) { chunks.push(text.slice(0, lastBreakIndex + 1)); text = text.slice(lastBreakIndex + 1); }
    else { chunks.push(chunk); text = text.slice(maxChunkSize); }
  }
  return chunks;
}

function cleanText(text) {
  return text.replace(/[ \t]+/g, " ").trim();
}

export async function onRequest({ request }) {
  // 处理跨域预检（其他域名调用时浏览器会先发 OPTIONS）
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  // 只接受 POST；其余方法明确返回 405 + Allow 头，避免歧义
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Allow": "POST, OPTIONS", "Access-Control-Allow-Origin": "*" },
    });
  }
  try {
    var body = await request.json();
    var input = body.input || "你好";
    var ssmlInput = body.ssml || null;
    var voice = body.voice || "zh-CN-XiaoxiaoNeural";
    var speed = body.speed !== undefined ? body.speed : 1.0;
    var rate = ((speed - 1) * 100).toFixed(0);
    var pitch = "0";
    if (ssmlInput) {
      // SSML 直传：不转义、不切片，直接转发 Edge（用于拼音声母的 <phoneme> 轻声呼读音）
      var ssmlBlob = await getAudioChunkRaw(ssmlInput, voice, rate, pitch, request);
      return new Response(ssmlBlob, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
      });
    }
    var chunks = splitTextIntoChunks(cleanText(input), 2000);
    var audioChunks = [];
    for (var i = 0; i < chunks.length; i++) {
      audioChunks.push(await getAudioChunk(chunks[i], voice, rate, pitch, request));
    }
    return new Response(new Blob(audioChunks, { type: "audio/mpeg" }), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err.message, type: "api_error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}
