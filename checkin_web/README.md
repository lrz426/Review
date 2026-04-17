# 双人任务打卡网页

一个可直接运行的轻量网页应用，支持两个人按日期管理任务并进行打卡反馈。

## 功能

- 按日期添加、查看、删除任务
- 勾选任务完成状态（完成给鼓励，取消给安慰）
- 一键生成当日打卡总结
- 一键把未完成任务复制到第二天
- 双用户切换（默认：`我` 和 `搭子`）
- 页面简洁，支持手机端

## 本地运行

```powershell
cd "D:\李日增\Documents\New project\checkin_web"
python -m pip install -r requirements.txt
python app.py
```

打开 `http://127.0.0.1:8000`。

## 双击运行（推荐）

在项目根目录双击下面文件即可启动：

- `start_checkin.bat`

脚本会自动完成：

- 创建虚拟环境（首次）
- 安装依赖（首次或依赖变化时）
- 启动网页服务
- 打印手机访问地址（同一 Wi-Fi）

如果手机访问不到，再右键管理员运行：

- `enable_phone_access.bat`

## 云端部署（Railway，推荐）

> 目标：让网页 24 小时在线，你关机后也能访问。

### 1. 上传代码到 GitHub

把 `checkin_web` 目录作为一个 GitHub 仓库上传（仓库里应包含 `app.py`、`Procfile`、`requirements.txt` 等文件）。

### 2. 在 Railway 创建项目

1. 登录 Railway。
2. 点 `New Project` -> `Deploy from GitHub repo`。
3. 选择你刚上传的仓库。

### 3. 添加持久化存储卷（防止打卡数据丢失）

1. 在该服务中点 `+ New` -> `Volume`。
2. 挂载路径填：`/data`。
3. 在 Variables 里新增：`DB_PATH=/data/checkin.db`。

### 4. 可选变量（修改两个用户名字）

- `USER_A_NAME=李日增`
- `USER_B_NAME=伙伴`

### 5. 获取可分享链接

Railway 部署完成后会生成一个公开域名，直接发给另一个人即可共同使用。

## 生产启动方式

项目已内置 `Procfile`，云端会用下面命令启动：

```bash
gunicorn -w 1 -k gthread --threads 4 --timeout 120 -b 0.0.0.0:$PORT app:app
```

## 数据存储说明

- 不设置 `DB_PATH` 时，默认使用本地 `data/checkin.db`。
- 云端建议始终设置 `DB_PATH` 到持久化卷路径（例如 `/data/checkin.db`）。
