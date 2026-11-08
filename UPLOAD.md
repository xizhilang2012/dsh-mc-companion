# 上传说明 · 0.1.1-beta.1

产物都做好了，放在 `dist/`：

| 文件 | 大小 | 用途 |
|---|---|---|
| `dsh-mc-companion-0.1.1-beta.1.tgz` | 121 KB | **npm 包**：里面有插件 + mod 的 jar + AGENTS.md + INSTALL.md |
| `dsh-mc-companion-0.1.1-beta.1-source.zip` | 180 KB | **源码**：给 GitHub 用（不含构建产物和参考素材） |

> 两个都验过了：tgz 里有 `mod/build/libs/mc-companion-0.1.1-beta.1.jar`、
> `AGENTS.md`、`INSTALL.md`、`LICENSE`；zip 里没有 `cache/`、没有 gradle 分发、
> 没有皮肤预览中间图。

## 卡在哪

上传需要**账号凭据**，我这边没有，也不该碰：

- 这台机器**没装 git，也没装 gh**；我试过 `winget install Git.Git`，下载被网络挡了
  （`InternetOpenUrl() failed`，github release 直连不通）
- 没有 `GITHUB_TOKEN` / `NPM_TOKEN` 之类的环境变量
- `~/.npmrc` 我不读（这是凭据文件）

所以最后一步得你来点。下面两条路选一条。

## 路线 A：网页上传（不装任何东西，最快）

1. 打开 https://github.com/new
2. 仓库名 `dsh-mc-companion`，选 **Private**（你之前说没做完先别公开）
3. 建好后点 **uploading an existing file**
4. 把 `dist\dsh-mc-companion-0.1.1-beta.1-source.zip` **解压**，把里面的东西全选拖进去
5. Commit

> 注意：拖的是**解压后的文件**，不是 zip 本身。

## 路线 B：装 Git 后走命令行

Git 官网的安装包如果下不动，用镜像：

```
https://mirrors.tuna.tsinghua.edu.cn/github-release/git-for-windows/git/LatestRelease/
```

装完（记得勾选 "Git from the command line"），在这个目录下跑：

```powershell
cd D:\...\plugins\mc-companion

git init
git config user.name  "xizhilang2012"
git config user.email "xizhilang2012@users.noreply.github.com"
git add -A
git commit -m "mc-companion 0.1.1-beta.1（测试版）"

git branch -M main
git remote add origin https://github.com/xizhilang2012/dsh-mc-companion.git
git push -u origin main
```

push 时会弹一次浏览器登录（Git Credential Manager），登录完就不用再管。

## 发到 npm（可选，让 `dsh plugin add dsh-mc-companion` 直接能装）

需要 npm 账号已登录：

```powershell
cd D:\...\plugins\mc-companion
npm login                      # 浏览器登录一次
npm publish --access public --tag beta
```

⚠️ **必须带 `--tag beta`**：`0.1.1-beta.1` 是预发布版本，不加 tag 会占掉 `latest`，
别人 `npm install dsh-mc-companion` 会装到这个测试版。

别人装的时候也要指定 tag：

```powershell
dsh plugin --profile desktop add dsh-mc-companion@beta
```

## 上传前最后检查（30 秒）

```powershell
# 1. 仓库里别混进参考素材（有版权风险）
dir cache                       # 应该只有你本地有；zip 里没有它
# 2. 版本三处一致
(Get-Content package.json -Raw | ConvertFrom-Json).version
(Get-Content mod\src\main\resources\fabric.mod.json -Raw | ConvertFrom-Json).version
dir mod\build\libs              # mc-companion-0.1.1-beta.1.jar
# 3. 测试
node --test tests\*.test.mjs    # 应该 115 全过
```

## 传完之后

1. 把 GitHub 仓库地址填到 `package.json` 的 `repository`（已经填了 `xizhilang2012/dsh-mc-companion`，名字不一样就改）
2. 想上 DSH 插件目录的话，往 https://dsh.directory 或 https://dshfind.com 提交
3. 记得在 README 顶上标 **beta**，并且写明**只支持 1.20.1 + Fabric**
