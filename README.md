# 纯网页公开版

这个目录可以直接发布到 GitHub Pages。它不依赖 Python、Gradio 或云服务器。

`data/patients.json` 已经做了公开版脱敏：姓名改为病例编号，并移除了住址、源文件名、原始病历全文、头像路径等字段。

## 功能

- 读取 `data/patients.json` 展示病例
- 本地 JavaScript 规则问诊
- 可选 OpenAI 兼容大模型调用
- 浏览器 Web Speech API 语音识别
- 浏览器 `speechSynthesis` 语音合成

## 大模型密钥

不要把自己的 API Key 写进代码后上传 GitHub。当前页面会把配置保存在访问者自己的浏览器 `localStorage` 中。

如果模型服务不允许浏览器跨域调用，可以在配置里选择“调用后端代理/云函数”，填入你自己的代理接口地址。

## 本地预览

```powershell
cd F:\cx\xunibingren\web
python -m http.server 8000
```

然后打开：

```text
http://127.0.0.1:8000
```

## GitHub Pages 发布

把 `web` 目录里的内容上传到 GitHub 仓库根目录，然后在仓库：

```text
Settings -> Pages -> Build and deployment -> Deploy from branch
```

选择：

```text
main / root
```

发布后网址类似：

```text
https://你的用户名.github.io/仓库名/
```
