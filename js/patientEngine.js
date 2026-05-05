(function () {
  const SECTION_LABELS = ["主诉", "现病史", "既往史", "个人史", "婚育史", "月经史", "家族史", "体格检查"];
  const QUESTION_KEYWORDS = {
    name: ["你叫什么", "姓名", "名字"],
    age: ["几岁", "年龄"],
    gender: ["性别", "男的女的"],
    occupation: ["职业", "做什么工作", "干什么的"],
    address: ["住哪", "住址", "哪里人", "家住哪"],
    marriage: ["婚姻", "结婚", "成家"],
    chief: ["主诉", "哪里不舒服", "最难受", "最不舒服", "哪里难受", "这次为什么来"],
    pain: ["哪里疼", "疼在哪", "哪些关节", "哪儿疼", "痛在哪", "哪里痛", "关节怎么样"],
    course: ["现病史", "病程", "怎么开始", "多久", "什么时候开始", "什么时候发病", "一开始怎么样", "最早怎么回事"],
    history: ["既往史", "以前什么病", "基础病", "合并症", "以前得过什么病", "慢性病", "还有什么病史", "得过什么大病"],
    allergy: ["过敏", "药物过敏", "过敏史"],
    family: ["家族史", "家里人", "家里有人有这个病吗", "遗传"],
    personal: ["个人史", "吸烟", "喝酒", "抽烟", "饮酒"],
    marriageHistory: ["婚育史"],
    menstrual: ["月经"],
    exam: ["体格检查", "生命体征", "体温", "血压", "脉搏"],
    medication: ["用药", "吃什么药", "治疗", "平时吃什么药", "用过什么药", "一直在吃什么"],
    diagnosis: ["诊断", "什么病", "是不是类风湿", "医生说是什么病", "考虑什么病"],
    plan: ["怎么治疗", "治疗方案", "住院", "手术", "怎么办", "怎么治"],
  };

  function normalizeText(text) {
    return String(text || "").toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, "");
  }

  function sentenceSplit(text) {
    return String(text || "")
      .split(/[。；;！？!?]/)
      .map((item) => item.trim().replace(/^[ ，、\n\r\t]+|[ ，、\n\r\t]+$/g, ""))
      .filter(Boolean);
  }

  function clauseSplit(text) {
    return String(text || "")
      .split(/[，,。；;：:]/)
      .map((item) => item.trim().replace(/^[ ，、\n\r\t]+|[ ，、\n\r\t]+$/g, ""))
      .filter(Boolean);
  }

  function cleanRecordText(text) {
    let cleaned = String(text || "").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
    for (const label of SECTION_LABELS) {
      cleaned = cleaned.replace(new RegExp(`^${label}\\s*[:：]?\\s*`), "");
    }
    return cleaned.replace(/^[，。；;\s]+|[，。；;\s]+$/g, "");
  }

  function toFirstPerson(text) {
    let cleaned = cleanRecordText(text);
    const replacements = [
      ["患者自诉", "我自己觉得"],
      ["患者诉", "我觉得"],
      ["患者称", "我说"],
      ["患者", "我"],
      ["病程中", "这段时间"],
      ["其", "我"],
      ["否认", "我没有"],
      ["无明显诱因下", "没有明显原因就"],
      ["出现", "有了"],
      ["受凉后加重", "受凉以后会更明显"],
      ["可持续1h左右", "大概能持续1个小时左右"],
      ["可持续", "大概会持续"],
      ["诊断为", "医生说是"],
      ["诊断类风湿关节炎", "医生说是类风湿关节炎"],
      ["予", "后来给我用了"],
      ["联合", "加上"],
      ["治疗", ""],
      ["收住我科", "安排我住院"],
      ["后就诊", "后来去"],
    ];
    for (const [source, target] of replacements) {
      cleaned = cleaned.split(source).join(target);
    }
    return cleaned
      .replace(/^为求诊治.*?[，。]/, "")
      .replace(/^因/, "")
      .replace(/\s+/g, " ")
      .replace(/我我/g, "我")
      .trim();
  }

  function textOverlapScore(question, sentence) {
    const q = normalizeText(question);
    const s = normalizeText(sentence);
    if (!q || !s) return 0;
    const qTokens = new Set();
    const sTokens = new Set();
    for (let i = 0; i < Math.max(q.length - 1, 1); i += 1) qTokens.add(q.slice(i, i + 2));
    for (let i = 0; i < Math.max(s.length - 1, 1); i += 1) sTokens.add(s.slice(i, i + 2));
    let score = 0;
    for (const token of qTokens) {
      if (sTokens.has(token)) score += 1;
    }
    return score;
  }

  function trimAnswer(text, maxSentences = 3, maxChars = 220) {
    const parts = sentenceSplit(text);
    let answer = parts.length ? parts.slice(0, maxSentences).join("。") : String(text || "");
    if (answer && !/[。！？]$/.test(answer)) answer += "。";
    answer = answer.replace(/\s+/g, " ").trim();
    if (answer.length > maxChars) {
      answer = answer.slice(0, maxChars).replace(/[，、\s]+$/g, "");
      if (answer && !/[。！？]$/.test(answer)) answer += "。";
    }
    return answer;
  }

  function uniqueKeepOrder(items) {
    const seen = new Set();
    const result = [];
    for (const raw of items) {
      const item = String(raw || "").replace(/^[ ，。；;]+|[ ，。；;]+$/g, "");
      if (!item || seen.has(item)) continue;
      seen.add(item);
      result.push(item);
    }
    return result;
  }

  function pickHedge(question) {
    if (["多久", "什么时候", "多长时间"].some((word) => question.includes(word))) return "大概";
    if (["以前", "有没有", "记得"].some((word) => question.includes(word))) return "印象里";
    return "我记得";
  }

  function includesAny(text, keywords) {
    return keywords.some((keyword) => String(text || "").includes(keyword));
  }

  function presentClauses(patient) {
    return clauseSplit(patient.present_illness).map(toFirstPerson);
  }

  function pickPresentClauses(patient, includeKeywords, excludeKeywords = [], limit = 2) {
    const matches = [];
    for (const clause of presentClauses(patient)) {
      if (excludeKeywords.length && includesAny(clause, excludeKeywords)) continue;
      if (includeKeywords.length && !includesAny(clause, includeKeywords)) continue;
      matches.push(clause);
    }
    return uniqueKeepOrder(matches).slice(0, limit);
  }

  function historyPositiveItems(patient) {
    const positives = [];
    const text = patient.past_history || "";
    const pattern = /有[“"']?([^”"'，。；;]+?)(?:”)?病史([^，。；;]*)/g;
    for (const match of text.matchAll(pattern)) {
      const disease = cleanRecordText(match[1]).replace(/[“”"']/g, "");
      const duration = cleanRecordText(match[2]);
      if (disease) positives.push(`${disease}${duration}`.trim());
    }
    return uniqueKeepOrder(positives);
  }

  function historyNegativeItems(patient) {
    const negatives = [];
    const text = patient.past_history || "";
    const pattern = /否认[“"']?([^”"'，。；;]+?)(?:”)?病史/g;
    for (const match of text.matchAll(pattern)) {
      negatives.push(cleanRecordText(match[1]).replace(/[“”"']/g, ""));
    }
    return uniqueKeepOrder(negatives);
  }

  function diagnosisLabels(patient) {
    const labels = [];
    const pool = [patient.present_illness, patient.summary, patient.chief_complaint, patient.past_history].join(" ");
    if (pool.includes("类风湿关节炎")) labels.push("类风湿关节炎");
    labels.push(...(patient.comorbidities || []));
    return uniqueKeepOrder(labels);
  }

  function formatPresentCourse(patient, question) {
    const questionText = question || "";
    const present = toFirstPerson(patient.present_illness || "");
    const onsetMatch = present.match(/(?:约)?(\d+\s*(?:余)?(?:年|个月|月|周|天)(?:余|来|左右)?)[^，。；;]{0,18}?(?:开始|发病|有了|出现)([^，。；;]+)/);
    const onsetBits = [];
    if (onsetMatch) {
      onsetBits.push(`大概${onsetMatch[1]}前开始的`);
      onsetBits.push(`一开始主要是${onsetMatch[2].trim()}`);
    } else {
      onsetBits.push(
        ...pickPresentClauses(
          patient,
          ["年前", "月前", "天前", "肿痛", "疼痛", "晨僵", "咽喉肿痛"],
          ["就诊", "门诊", "住院", "医生说", "给我用了"],
          2,
        ),
      );
    }

    let extraBits = [];
    if (includesAny(questionText, ["什么时候", "多久", "多长时间", "最早", "一开始"])) {
      extraBits = pickPresentClauses(patient, ["受凉", "晨起", "僵硬", "晨僵", "加重"], ["就诊", "门诊", "住院", "医生说", "给我用了"], 2);
    } else if (includesAny(questionText, ["现在", "目前", "最近", "这次"])) {
      extraBits = pickPresentClauses(patient, ["目前", "现在", "仍有", "咽喉肿痛", "耳朵疼", "恶心", "呕吐"], ["门诊", "住院", "医生说", "给我用了"], 2);
    } else {
      extraBits = pickPresentClauses(patient, ["受凉", "晨起", "僵硬", "咽喉肿痛", "恶心", "呕吐"], ["门诊", "住院", "医生说", "给我用了"], 2);
    }

    const parts = uniqueKeepOrder([...onsetBits, ...extraBits]);
    if (!parts.length) return `大概就是${cleanRecordText(patient.chief_complaint)}，别的病历里没写那么细。`;
    return parts.join("，");
  }

  function openingMessage(patient) {
    const complaint = cleanRecordText(patient.chief_complaint);
    if (complaint) {
      const complaintParts = clauseSplit(complaint)
        .map((part) => part.replace(/\d+\s*(?:余)?(?:年|个月|月|周|天)(?:余|来|左右)?/g, "").replace(/^[ ，、]+|[ ，、]+$/g, ""))
        .filter(Boolean);
      if (complaintParts.length >= 2) {
        return `医生你好，我叫${patient.name}。我这次主要还是${complaintParts[0]}，这几天还伴着${complaintParts[1]}，你可以直接问我。`;
      }
      return `医生你好，我叫${patient.name}。我这次主要是因为${complaintParts[0] || complaint}来的，你可以直接问我。`;
    }
    return `医生你好，我叫${patient.name}。你可以像门诊问诊那样直接跟我聊。`;
  }

  function answerOccupation(patient) {
    return patient.occupation ? `我平时是${patient.occupation}。` : "这个病历里没写我的职业。";
  }

  function answerAddress(patient) {
    return patient.address ? `我住在${patient.address}。` : "住址这块病历里没写得很细。";
  }

  function answerMarriage(patient) {
    return patient.marital_status ? `病历里记的是${patient.marital_status}。` : "这个病历里没有特别写。";
  }

  function answerChief(patient) {
    const chief = cleanRecordText(patient.chief_complaint);
    if (!chief) return "主要还是关节这块不舒服来看的。";
    const parts = clauseSplit(chief)
      .map((part) => part.replace(/\d+\s*(?:余)?(?:年|个月|月|周|天)(?:余|来|左右)?/g, "").replace(/^[ ，、]+|[ ，、]+$/g, ""))
      .filter(Boolean);
    if (parts.length >= 2) return `主要还是${parts[0]}，这次还伴着${parts[1]}。`;
    return `我这次主要就是因为${parts[0] || chief}来的。`;
  }

  function answerPainLocation(patient) {
    const match = String(patient.present_illness || "").match(/主要累及([^。；]+)/);
    if (match) return `主要是${cleanRecordText(match[1])}这些关节不舒服。`;
    const clauses = pickPresentClauses(patient, ["关节", "疼", "痛", "肿", "僵"], ["就诊", "门诊", "住院", "医生说", "给我用了"], 2);
    if (clauses.length) return clauses.join("，");
    if (patient.chief_complaint) return `主要还是${cleanRecordText(patient.chief_complaint)}。`;
    return "就是关节这块不太舒服。";
  }

  function answerPresentIllness(patient, question) {
    if (!patient.present_illness) return "这段病程病历里没写得特别详细。";
    const prefix = pickHedge(question);
    const body = formatPresentCourse(patient, question);
    return body.startsWith(prefix) ? body : `${prefix}，${body}`;
  }

  function answerComorbidities(patient) {
    const positiveItems = historyPositiveItems(patient);
    if (positiveItems.length) {
      let answer = `以前有${positiveItems.slice(0, 3).join("、")}。`;
      const chronicNegatives = historyNegativeItems(patient).filter((item) => ["高血压", "糖尿病", "冠心病"].includes(item));
      if (chronicNegatives.length) answer += ` 像${chronicNegatives.join("、")}这些，病历里写的是没有。`;
      return answer;
    }
    if (patient.comorbidities && patient.comorbidities.length) return `我以前还有${patient.comorbidities.join("、")}这些毛病。`;
    if (patient.past_history) return toFirstPerson(patient.past_history);
    return "以前的大病病历里没写太多。";
  }

  function answerAllergies(patient) {
    return patient.allergies && patient.allergies.length ? `我对${patient.allergies.join("、")}过敏。` : "病历里写的是我没有明确过敏史。";
  }

  function answerFamilyHistory(patient) {
    const family = patient.family_history || "";
    if (family.includes("否认类似患者") || family.includes("否认家族遗传性病史")) {
      return "家里人里目前没听说有跟我一样的情况，病历里也写着没有明确遗传病史。";
    }
    return patient.family_history ? toFirstPerson(patient.family_history) : "家里这方面病历里没写得很明确。";
  }

  function answerPersonalHistory(patient) {
    return patient.personal_history ? toFirstPerson(patient.personal_history) : "个人生活习惯这块病历里没写太细。";
  }

  function answerVitals(patient) {
    const vitals = patient.vitals || {};
    if (!Object.keys(vitals).length) {
      return patient.physical_exam ? `我只记得医生当时查体的时候提到过：${toFirstPerson(patient.physical_exam)}` : "生命体征这块病历里没有单独写清楚。";
    }
    return `入院时医生量的是体温${vitals.temperature || "未记录"}℃，脉搏${vitals.pulse || "未记录"}次每分，血压${vitals.blood_pressure || "未记录"}。`;
  }

  function answerMedications(patient) {
    return patient.medications && patient.medications.length
      ? `之前医生给我用过或者病历里提到过的药，主要有${patient.medications.slice(0, 6).join("、")}。`
      : "用药这块病历里没记得特别细。";
  }

  function answerDiagnosisStyle(patient) {
    const labels = diagnosisLabels(patient);
    if (!labels.length) return "具体叫什么病我说不专业，还是得听医生怎么判断。";
    let answer = `具体我也说不太专业，不过之前医生一直按${labels[0]}给我看。`;
    if (labels.length > 1) answer += `另外我还有${labels.slice(1, 3).join("、")}这些毛病。`;
    return answer;
  }

  function answerPlanStyle(patient) {
    return patient.medications && patient.medications.length
      ? `治疗上我就记得之前用过${patient.medications.slice(0, 4).join("、")}这些药，具体方案还是得看医生。`
      : "这个我也不太会说，还是得听医生安排。";
  }

  function answerSpecificSymptom(patient, question) {
    const symptomMap = [
      ["晨僵", "晨僵"],
      ["肿", "肿胀"],
      ["发热", "发热"],
      ["口干", "口干"],
      ["眼干", "眼干"],
      ["胸闷", "胸闷"],
      ["恶心", "恶心"],
      ["呕吐", "呕吐"],
    ];
    for (const [keyword, label] of symptomMap) {
      if (!question.includes(keyword)) continue;
      const pool = [patient.present_illness, patient.chief_complaint, patient.raw_text].join(" ");
      if (pool.includes(keyword) || pool.includes(label)) {
        const clauses = pickPresentClauses(patient, [keyword, label], ["就诊", "门诊", "住院", "医生说", "给我用了"], 2);
        if (clauses.length) return clauses.join("，");
        return toFirstPerson(patient.chief_complaint || pool);
      }
      return `${keyword}这个，病历里没有写得特别明确。`;
    }
    return "";
  }

  function searchBestSentences(patient, question) {
    const candidates = [];
    for (const section of [patient.present_illness, patient.past_history, patient.personal_history, patient.family_history, patient.physical_exam]) {
      for (const sentence of sentenceSplit(section)) {
        const score = textOverlapScore(question, sentence);
        if (score) candidates.push([score, sentence]);
      }
    }
    if (!candidates.length) return "";
    candidates.sort((a, b) => b[0] - a[0]);
    const top = candidates.slice(0, 2).map((item) => toFirstPerson(item[1]));
    return top.length === 1 ? top[0] : `${top[0]}。补充一点，${top[1]}`;
  }

  function answerWithRules(patient, question) {
    const stripped = String(question || "").trim();
    if (!stripped) {
      return {
        question,
        answer: "你可以直接问我哪里不舒服、疼了多久、有没有晨僵，或者以前吃过什么药。",
        source: "rules",
      };
    }

    const dispatch = [
      ["name", () => `我叫${patient.name}。`],
      ["age", () => `我今年${patient.age}。`],
      ["gender", () => `我是${patient.gender}。`],
      ["occupation", () => answerOccupation(patient)],
      ["address", () => answerAddress(patient)],
      ["marriage", () => answerMarriage(patient)],
      ["chief", () => answerChief(patient)],
      ["pain", () => answerPainLocation(patient)],
      ["course", () => answerPresentIllness(patient, stripped)],
      ["history", () => answerComorbidities(patient)],
      ["allergy", () => answerAllergies(patient)],
      ["family", () => answerFamilyHistory(patient)],
      ["personal", () => answerPersonalHistory(patient)],
      ["marriageHistory", () => (patient.marriage_history ? toFirstPerson(patient.marriage_history) : "婚育史这块病历里没写。")],
      ["menstrual", () => (patient.menstrual_history ? toFirstPerson(patient.menstrual_history) : "这个病历里没记这部分。")],
      ["exam", () => answerVitals(patient)],
      ["medication", () => answerMedications(patient)],
      ["diagnosis", () => answerDiagnosisStyle(patient)],
      ["plan", () => answerPlanStyle(patient)],
    ];

    for (const [key, handler] of dispatch) {
      if (includesAny(stripped, QUESTION_KEYWORDS[key])) {
        return { question, answer: trimAnswer(handler()), source: "rules" };
      }
    }

    const symptomAnswer = answerSpecificSymptom(patient, stripped);
    if (symptomAnswer) return { question, answer: trimAnswer(symptomAnswer), source: "rules" };

    const fallback = searchBestSentences(patient, stripped);
    if (fallback) return { question, answer: trimAnswer(fallback), source: "rules" };

    return {
      question,
      answer: "这个我一下子说不太清，病历里也没写那么细。你可以换个问法，比如问我哪里疼、疼了多久，或者以前用过什么药。",
      source: "rules",
    };
  }

  function patientContext(patient) {
    const timeline = (patient.timeline || []).map((item) => `${item.when}:${item.detail}`).join("；") || "未提取到明确时间线";
    const meds = (patient.medications || []).join("、") || "未明确记录";
    const comorbidities = (patient.comorbidities || []).join("、") || "未明确记录";
    const allergies = (patient.allergies || []).join("、") || "否认明确过敏史";
    const symptoms = (patient.symptoms || []).join("、") || "未明确记录";
    const vitals = patient.vitals || {};
    const vitalText = `体温${vitals.temperature || "--"}℃，脉搏${vitals.pulse || "--"}次/分，呼吸${vitals.respiratory_rate || "--"}次/分，血压${vitals.blood_pressure || "--"}mmHg，身高${vitals.height_cm || "--"}cm，体重${vitals.weight_kg || "--"}kg`;
    return [
      `姓名：${patient.name}`,
      `性别：${patient.gender}`,
      `年龄：${patient.age}`,
      `职业：${patient.occupation || "未记录"}`,
      `住址：${patient.address || "未记录"}`,
      `婚姻：${patient.marital_status || "未记录"}`,
      `主诉：${cleanRecordText(patient.chief_complaint) || "未记录"}`,
      `症状关键词：${symptoms}`,
      `现病史：${cleanRecordText(patient.present_illness) || "未记录"}`,
      `既往史：${cleanRecordText(patient.past_history) || "未记录"}`,
      `个人史：${cleanRecordText(patient.personal_history) || "未记录"}`,
      `婚育史：${cleanRecordText(patient.marriage_history) || "未记录"}`,
      `月经史：${cleanRecordText(patient.menstrual_history) || "未记录"}`,
      `家族史：${cleanRecordText(patient.family_history) || "未记录"}`,
      `体格检查：${cleanRecordText(patient.physical_exam) || "未记录"}`,
      `生命体征：${vitalText}`,
      `用药史：${meds}`,
      `合并症：${comorbidities}`,
      `过敏史：${allergies}`,
      `病程时间线：${timeline}`,
    ].join("\n");
  }

  function systemPrompt() {
    return [
      "你现在要扮演一个真实门诊病人，只能以病人的口吻、用第一人称回答医生。",
      "回答必须严格基于提供的病例资料，不要虚构新的检查结果、用药、病史、生活习惯或家族史。",
      "说话要像真人，不要像病历摘要，不要条列，不要讲教科书，不要用英文标签。",
      "只回答医生当前问到的内容，被问到哪里就说哪里，不要一次性把全部病史倒出来。",
      "可以有一点口语化和不确定感，比如“好像”“大概”“记不太清”，但不要每句话都这样。",
      "如果病历里没有写，就自然地说“这个病历里没写那么细”“我记不太清了”。",
      "如果医生问诊断、治疗方案、鉴别诊断或医学判断，不要站在医生角度分析，只能从病人自身经历回答。",
      "通常回答 1 到 3 句，能短就短，避免重复医生的问题。",
    ].join("");
  }

  function sanitizeLlmAnswer(answer) {
    let text = String(answer || "").replace(/\s+/g, " ").trim();
    text = text.replace(/^(病人|患者|虚拟病人|回答)\s*[:：]\s*/, "");
    text = text.replace(/^医生[，,:： ]*/, "");
    text = text.replace(/[-*#`]+/g, "");
    text = text.replace(/\bAI\b/g, "").replace(/assistant/gi, "");
    for (const label of SECTION_LABELS) {
      text = text.replace(new RegExp(`${label}\\s*[:：]`, "g"), "");
    }
    return trimAnswer(text, 3, 240);
  }

  window.PatientEngine = {
    openingMessage,
    answerWithRules,
    patientContext,
    systemPrompt,
    sanitizeLlmAnswer,
    cleanRecordText,
    clauseSplit,
  };
})();
