(function () {
  const $ = (id) => document.getElementById(id);
  const settingsKey = "virtualPatientWebSettings";
  let patients = [];
  let currentPatient = null;
  let history = [];
  let recording = false;
  let audioContext = null;
  let mediaStream = null;
  let recorderSource = null;
  let recorderNode = null;
  let recordedBuffers = [];
  let recordedSampleRate = 16000;
  let lastAssistantText = "";

  const defaultSettings = {
    llmMode: "direct",
    llmBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    llmModel: "",
    llmApiKey: "",
    llmProxyUrl: "",
    llmTemperature: "0.55",
    useLlm: false,
    autoSpeak: true,
    tencentAppId: "",
    tencentSecretId: "",
    tencentSecretKey: "",
    tencentRegion: "ap-shanghai",
    tencentAsrEngineType: "16k_zh",
    tencentAsrHotwordId: "",
    tencentTtsVoiceType: "1001",
    tencentTtsSampleRate: "16000",
    tencentTtsCodec: "wav",
    tencentTtsSpeed: "0",
    tencentTtsVolume: "0",
  };

  function html(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, (item) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[item]));
  }

  function loadSettings() {
    try {
      return Object.assign({}, defaultSettings, JSON.parse(localStorage.getItem(settingsKey) || "{}"));
    } catch (error) {
      return Object.assign({}, defaultSettings);
    }
  }

  function saveSettingsToStorage(settings) {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  }

  function readSettingsForm() {
    return {
      llmMode: $("llmMode").value,
      llmBaseUrl: $("llmBaseUrl").value.trim(),
      llmModel: $("llmModel").value.trim(),
      llmApiKey: $("llmApiKey").value.trim(),
      llmProxyUrl: $("llmProxyUrl").value.trim(),
      llmTemperature: $("llmTemperature").value || "0.55",
      useLlm: $("useLlm").checked,
      autoSpeak: $("autoSpeak").checked,
      tencentAppId: $("tencentAppId").value.trim(),
      tencentSecretId: $("tencentSecretId").value.trim(),
      tencentSecretKey: $("tencentSecretKey").value.trim(),
      tencentRegion: $("tencentRegion").value.trim() || "ap-shanghai",
      tencentAsrEngineType: $("tencentAsrEngineType").value.trim() || "16k_zh",
      tencentAsrHotwordId: $("tencentAsrHotwordId").value.trim(),
      tencentTtsVoiceType: $("tencentTtsVoiceType").value.trim() || "1001",
      tencentTtsSampleRate: $("tencentTtsSampleRate").value.trim() || "16000",
      tencentTtsCodec: $("tencentTtsCodec").value || "wav",
      tencentTtsSpeed: $("tencentTtsSpeed").value || "0",
      tencentTtsVolume: $("tencentTtsVolume").value || "0",
    };
  }

  function applySettingsToForm(settings) {
    $("llmMode").value = settings.llmMode;
    $("llmBaseUrl").value = settings.llmBaseUrl;
    $("llmModel").value = settings.llmModel;
    $("llmApiKey").value = settings.llmApiKey;
    $("llmProxyUrl").value = settings.llmProxyUrl;
    $("llmTemperature").value = settings.llmTemperature;
    $("useLlm").checked = settings.useLlm;
    $("autoSpeak").checked = settings.autoSpeak;
    $("tencentAppId").value = settings.tencentAppId || "";
    $("tencentSecretId").value = settings.tencentSecretId || "";
    $("tencentSecretKey").value = settings.tencentSecretKey || "";
    $("tencentRegion").value = settings.tencentRegion || "ap-shanghai";
    $("tencentAsrEngineType").value = settings.tencentAsrEngineType || "16k_zh";
    $("tencentAsrHotwordId").value = settings.tencentAsrHotwordId || "";
    $("tencentTtsVoiceType").value = settings.tencentTtsVoiceType || "1001";
    $("tencentTtsSampleRate").value = settings.tencentTtsSampleRate || "16000";
    $("tencentTtsCodec").value = settings.tencentTtsCodec || "wav";
    $("tencentTtsSpeed").value = settings.tencentTtsSpeed || "0";
    $("tencentTtsVolume").value = settings.tencentTtsVolume || "0";
  }

  function setStatus(text) {
    $("statusText").textContent = text;
  }

  function setTextIfPresent(id, text) {
    const element = $(id);
    if (element) element.textContent = text;
  }

  function setSessionActive(active) {
    $("questionInput").disabled = !active;
    $("sendButton").disabled = !active;
    $("voiceButton").disabled = !active;
  }

  function toggleCaseDrawer(open) {
    const drawer = $("caseDrawer");
    const backdrop = $("caseBackdrop");
    if (!drawer || !backdrop) return;
    drawer.hidden = !open;
    backdrop.hidden = !open;
  }

  function setCloudStatus(text) {
    const element = $("cloudStatus");
    if (element) element.textContent = text;
  }

  function setVerifyStatus(text, ok = null) {
    const element = $("verifyStatus");
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("ok", ok === true);
    element.classList.toggle("error", ok === false);
  }

  function renderVerification(verification) {
    if (!verification) return;
    const asr = verification.asr || {};
    const tts = verification.tts || {};
    const allOk = Boolean(asr.ok && tts.ok);
    setVerifyStatus(
      `ASR：${asr.message || "未验证"}\nTTS：${tts.message || "未验证"}`,
      allOk,
    );
    if (tts.ok && tts.audioUrl) playAudioUrl(tts.audioUrl);
  }

  async function loadBackendSettings() {
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const tencent = data.tencent || {};
      const merged = Object.assign(loadSettings(), {
        tencentAppId: tencent.appId || "",
        tencentSecretId: tencent.secretId || "",
        tencentSecretKey: "",
        tencentRegion: tencent.region || "ap-shanghai",
        tencentAsrEngineType: tencent.asrEngineType || "16k_zh",
        tencentAsrHotwordId: tencent.asrHotwordId || "",
        tencentTtsVoiceType: String(tencent.ttsVoiceType || "1001"),
        tencentTtsSampleRate: String(tencent.ttsSampleRate || "16000"),
        tencentTtsCodec: tencent.ttsCodec || "wav",
        tencentTtsSpeed: String(tencent.ttsSpeed || "0"),
        tencentTtsVolume: String(tencent.ttsVolume || "0"),
      });
      applySettingsToForm(merged);
      setCloudStatus(`${tencent.asrReady ? "一句话 ASR 已配置" : "一句话 ASR 待配置"} · ${tencent.ttsReady ? "实时 TTS 已配置" : "实时 TTS 待配置"}${tencent.secretKeySet ? "" : " · SecretKey 未保存"}`);
    } catch (error) {
      setCloudStatus("未连接本地语音后端，请用 start_web_preview.bat 启动");
    }
  }

  async function saveBackendSettings(settings) {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tencent: {
          appId: settings.tencentAppId,
          secretId: settings.tencentSecretId,
          secretKey: settings.tencentSecretKey,
          region: settings.tencentRegion,
          asrEngineType: settings.tencentAsrEngineType,
          asrHotwordId: settings.tencentAsrHotwordId,
          ttsVoiceType: settings.tencentTtsVoiceType,
          ttsSampleRate: settings.tencentTtsSampleRate,
          ttsCodec: settings.tencentTtsCodec,
          ttsSpeed: settings.tencentTtsSpeed,
          ttsVolume: settings.tencentTtsVolume,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    $("tencentSecretKey").value = "";
    setCloudStatus(`${data.asrReady ? "一句话 ASR 已配置" : "一句话 ASR 待配置"} · ${data.ttsReady ? "实时 TTS 已配置" : "实时 TTS 待配置"}`);
    renderVerification(data.verification);
    return data;
  }

  async function verifyTencentConnection() {
    setVerifyStatus("正在验证腾讯云连接，请稍等...", null);
    const response = await fetch("/api/verify-tencent", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    renderVerification(data.verification);
    return data.verification;
  }

  function renderChat() {
    $("chatLog").innerHTML = history.map((item) => (
      `<div class="message ${item.role === "user" ? "user" : "assistant"}">` +
      `${html(item.content)}` +
      `${item.source ? `<span class="source">${html(item.source)}</span>` : ""}` +
      "</div>"
    )).join("");
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
  }

  function renderPatients() {
    $("patientSelect").innerHTML = patients.map((patient) => (
      `<option value="${html(patient.id)}">${html(displayLabel(patient))}</option>`
    )).join("");
  }

  function normalizePatient(patient, index) {
    const copy = Object.assign({}, patient);
    const rawName = String(copy.name || "");
    if (!rawName || rawName.includes("?")) {
      const idNumber = String(copy.id || "").match(/\d+/);
      copy.name = `病例${idNumber ? idNumber[0].padStart(2, "0") : String(index + 1).padStart(2, "0")}`;
    }
    return copy;
  }

  function displayLabel(patient) {
    return [patient.name, patient.gender, patient.age].filter(Boolean).join(" ");
  }

  function selectPatient(patientId) {
    currentPatient = patients.find((patient) => patient.id === patientId) || patients[0];
    $("patientSelect").value = currentPatient.id;
    history = [{ role: "assistant", content: PatientEngine.openingMessage(currentPatient), source: "开场" }];
    lastAssistantText = history[0].content;
    renderPatient();
    renderChat();
    setSessionActive(true);
    setStatus(`${displayLabel(currentPatient)} · 已加载`);
  }

  function renderPatient() {
    const patient = currentPatient;
    const vitals = patient.vitals || {};
    $("patientSummary").innerHTML = `
      <h2>${html(patient.name || "虚拟病人")}</h2>
      <div class="meta-line">${html([patient.gender, patient.age, patient.occupation].filter(Boolean).join(" · "))}</div>
      <div class="chips">
        ${(patient.highlights || []).slice(0, 4).map((item) => `<span class="chip">${html(item)}</span>`).join("")}
      </div>
    `;
    setTextIfPresent("patientBadge", patient.name || "虚拟病人");
    setTextIfPresent("patientMetaBrief", [patient.gender, patient.age, patient.occupation].filter(Boolean).join(" · ") || "问诊对象");
    setTextIfPresent("patientChiefBrief", patient.chief_complaint || "请根据病人回答继续追问");
    $("caseDetails").innerHTML = `
      <h3>主诉</h3>
      <p>${html(patient.chief_complaint || "未记录")}</p>
      <h3>生命体征</h3>
      <p>体温 ${html(vitals.temperature || "--")}℃ / 脉搏 ${html(vitals.pulse || "--")} / 呼吸 ${html(vitals.respiratory_rate || "--")} / 血压 ${html(vitals.blood_pressure || "--")}</p>
      <h3>现病史</h3>
      <p>${html(patient.present_illness || "未记录")}</p>
      <h3>既往史</h3>
      <p>${html(patient.past_history || "未记录")}</p>
      <h3>用药与风险</h3>
      <p>用药：${html((patient.medications || []).join("、") || "未明确记录")}</p>
      <p>合并症：${html((patient.comorbidities || []).join("、") || "未明确记录")}</p>
      <p>过敏史：${html((patient.allergies || []).join("、") || "否认明确过敏史")}</p>
      <h3>时间线</h3>
      <ul>${(patient.timeline || []).map((item) => `<li><strong>${html(item.when)}</strong> ${html(item.detail)}</li>`).join("") || "<li>未提取到明确时间线</li>"}</ul>
    `;
  }

  function normalizeBaseUrl(baseUrl) {
    const stripped = String(baseUrl || "").replace(/\/+$/, "");
    if (stripped.endsWith("/chat/completions")) return stripped;
    if (stripped.endsWith("/v1")) return `${stripped}/chat/completions`;
    return `${stripped}/chat/completions`;
  }

  function collectTextParts(content) {
    if (content == null) return [];
    if (typeof content === "string") return content.trim() ? [content.trim()] : [];
    if (Array.isArray(content)) return content.flatMap(collectTextParts);
    if (typeof content === "object") {
      const parts = [];
      for (const key of ["text", "content", "value", "output_text"]) {
        if (key in content) parts.push.apply(parts, collectTextParts(content[key]));
      }
      return parts;
    }
    return [String(content)];
  }

  async function requestLlm(question, settings) {
    const messages = [
      { role: "system", content: PatientEngine.systemPrompt() },
      { role: "system", content: PatientEngine.patientContext(currentPatient) },
      ...history.slice(-8).filter((item) => ["user", "assistant"].includes(item.role)).map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: question },
    ];
    const payload = {
      model: settings.llmModel,
      messages,
      temperature: Number(settings.llmTemperature || 0.55),
      max_tokens: 420,
    };

    if (settings.llmMode === "proxy") {
      if (!settings.llmProxyUrl) throw new Error("请先填写代理地址。");
      const response = await fetch(settings.llmProxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, payload, { patient: currentPatient, question })),
      });
      if (!response.ok) throw new Error(`代理请求失败：${response.status}`);
      const data = await response.json();
      const proxyContent = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
      const text = data.answer || data.text || data.content || collectTextParts(proxyContent).join("");
      if (!text) throw new Error("代理没有返回回答。");
      return PatientEngine.sanitizeLlmAnswer(text);
    }

    if (!settings.llmApiKey || !settings.llmModel || !settings.llmBaseUrl) {
      throw new Error("请先填写大模型 Base URL、Model 和 API Key。");
    }
    const response = await fetch(normalizeBaseUrl(settings.llmBaseUrl), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.llmApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`大模型请求失败：${response.status}`);
    const data = await response.json();
    const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    const text = collectTextParts(content).join("");
    if (!text) throw new Error("大模型返回为空。");
    return PatientEngine.sanitizeLlmAnswer(text);
  }

  async function answerQuestion(question) {
    const text = String(question || "").trim();
    if (!text || !currentPatient || $("questionInput").disabled) return;
    const settings = readSettingsForm();
    history.push({ role: "user", content: text });
    renderChat();
    $("questionInput").value = "";
    $("sendButton").disabled = true;
    setStatus("正在生成回答...");

    let answer;
    let source = "本地规则";
    if (settings.useLlm) {
      try {
        answer = await requestLlm(text, settings);
        source = "大模型";
      } catch (error) {
        const fallback = PatientEngine.answerWithRules(currentPatient, text);
        answer = fallback.answer;
        source = `本地规则 · 大模型未完成：${error.message}`;
      }
    } else {
      const result = PatientEngine.answerWithRules(currentPatient, text);
      answer = result.answer;
    }

    history.push({ role: "assistant", content: answer, source });
    lastAssistantText = answer;
    renderChat();
    setStatus(`${displayLabel(currentPatient)} · ${source}`);
    $("sendButton").disabled = false;
    if (settings.autoSpeak) await speak(answer, text);
  }

  function endSession() {
    if (!currentPatient) return;
    history.push({
      role: "assistant",
      content: "本次练习已结束。你可以打开病例填写核对要点，或切换病例开始下一轮练习。",
      source: "系统",
    });
    lastAssistantText = history[history.length - 1].content;
    renderChat();
    setSessionActive(false);
    window.speechSynthesis && window.speechSynthesis.cancel();
    $("avatarStage").classList.remove("speaking");
    setStatus(`${displayLabel(currentPatient)} · 练习已结束`);
  }

  function playAudioUrl(url) {
    const audio = new Audio(url);
    audio.onplay = () => $("avatarStage").classList.add("speaking");
    audio.onended = () => $("avatarStage").classList.remove("speaking");
    audio.onerror = () => $("avatarStage").classList.remove("speaking");
    audio.play().catch(() => $("avatarStage").classList.remove("speaking"));
  }

  function fallbackBrowserSpeak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    utterance.pitch = currentPatient && String(currentPatient.gender || "").includes("男") ? 0.9 : 1.05;
    utterance.onstart = () => $("avatarStage").classList.add("speaking");
    utterance.onend = () => $("avatarStage").classList.remove("speaking");
    utterance.onerror = () => $("avatarStage").classList.remove("speaking");
    window.speechSynthesis.speak(utterance);
  }

  async function speak(text, question = "") {
    if (!text) return;
    try {
      setStatus("正在调用腾讯云实时 TTS...");
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, question, patient: currentPatient }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      playAudioUrl(data.audioUrl);
      setStatus(`${displayLabel(currentPatient)} · 腾讯云实时 TTS · ${data.voiceLabel || "已生成语音"}`);
    } catch (error) {
      setStatus(`腾讯云实时 TTS 未完成：${error.message}；已尝试浏览器朗读。`);
      fallbackBrowserSpeak(text);
    }
  }

  function flattenBuffers(buffers) {
    const length = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const result = new Float32Array(length);
    let offset = 0;
    buffers.forEach((buffer) => {
      result.set(buffer, offset);
      offset += buffer.length;
    });
    return result;
  }

  function writeString(view, offset, value) {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  function encodeWav(samples, sampleRate) {
    const bytesPerSample = 2;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, samples.length * bytesPerSample, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i += 1, offset += 2) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([view], { type: "audio/wav" });
  }

  async function startTencentRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风录音。");
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    recordedSampleRate = audioContext.sampleRate;
    recordedBuffers = [];
    recorderSource = audioContext.createMediaStreamSource(mediaStream);
    recorderNode = audioContext.createScriptProcessor(4096, 1, 1);
    recorderNode.onaudioprocess = (event) => {
      if (!recording) return;
      recordedBuffers.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    recorderSource.connect(recorderNode);
    recorderNode.connect(audioContext.destination);
    recording = true;
    $("voiceButton").classList.add("active");
    $("voiceButton").setAttribute("title", "结束录音并识别");
    $("voiceButton").setAttribute("aria-label", "结束录音并识别");
    setStatus("正在录音，再按一次麦克风结束并调用腾讯云一句话识别。");
  }

  async function stopTencentRecording() {
    recording = false;
    $("voiceButton").classList.remove("active");
    $("voiceButton").disabled = true;
    $("voiceButton").setAttribute("title", "语音输入");
    $("voiceButton").setAttribute("aria-label", "语音输入");
    try {
      if (recorderNode) recorderNode.disconnect();
      if (recorderSource) recorderSource.disconnect();
      if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
      if (audioContext) await audioContext.close();
      const wavBlob = encodeWav(flattenBuffers(recordedBuffers), recordedSampleRate);
      if (wavBlob.size <= 44) throw new Error("没有录到有效声音。");
      const form = new FormData();
      form.append("audio", wavBlob, "question.wav");
      setStatus("正在调用腾讯云一句话识别...");
      const response = await fetch("/api/asr", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
      $("questionInput").value = data.transcript || "";
      setStatus(`腾讯云一句话识别：${data.transcript}`);
      await answerQuestion(data.transcript);
    } finally {
      audioContext = null;
      mediaStream = null;
      recorderSource = null;
      recorderNode = null;
      recordedBuffers = [];
      $("voiceButton").disabled = false;
    }
  }

  async function toggleTencentVoice() {
    try {
      if (recording) await stopTencentRecording();
      else await startTencentRecording();
    } catch (error) {
      recording = false;
      $("voiceButton").classList.remove("active");
      $("voiceButton").disabled = false;
      setStatus(`语音问诊失败：${error.message}`);
    }
  }

  async function init() {
    applySettingsToForm(loadSettings());
    await loadBackendSettings();
    const response = await fetch("./data/patients.json");
    if (!response.ok) throw new Error(`病例加载失败：${response.status}`);
    patients = (await response.json()).map(normalizePatient);
    renderPatients();
    selectPatient(patients[0].id);
  }

  $("settingsToggle").addEventListener("click", () => {
    $("settingsPanel").hidden = !$("settingsPanel").hidden;
  });
  $("settingsClose").addEventListener("click", () => {
    $("settingsPanel").hidden = true;
  });
  $("caseToggle").addEventListener("click", () => toggleCaseDrawer(true));
  $("caseClose").addEventListener("click", () => toggleCaseDrawer(false));
  $("caseBackdrop").addEventListener("click", () => toggleCaseDrawer(false));
  $("endSessionButton").addEventListener("click", endSession);
  $("saveSettings").addEventListener("click", async () => {
    const settings = readSettingsForm();
    saveSettingsToStorage(Object.assign({}, settings, { tencentSecretKey: "" }));
    try {
      await saveBackendSettings(settings);
      setStatus("配置已保存。腾讯云密钥保存在本地 .env，不会写入前端代码。");
      $("settingsPanel").hidden = true;
    } catch (error) {
      setStatus(`腾讯云配置保存失败：${error.message}`);
      setVerifyStatus(`保存或验证失败：${error.message}`, false);
    }
  });
  $("verifyTencent").addEventListener("click", async () => {
    try {
      await verifyTencentConnection();
      setStatus("腾讯云连接验证完成。");
    } catch (error) {
      setVerifyStatus(`验证失败：${error.message}`, false);
      setStatus(`腾讯云连接验证失败：${error.message}`);
    }
  });
  $("patientSelect").addEventListener("change", (event) => selectPatient(event.target.value));
  $("sendButton").addEventListener("click", () => answerQuestion($("questionInput").value));
  $("questionInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      answerQuestion($("questionInput").value);
    }
  });
  $("speakLastButton").addEventListener("click", () => speak(lastAssistantText));
  $("voiceButton").addEventListener("click", toggleTencentVoice);

  init().catch((error) => setStatus(error.message));
})();
