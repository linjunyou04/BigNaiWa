# 来源说明 / Source Notice

## 一句话

本仓库是 **「合成大奶娃」的第三方镜像备份**，代码与素材均来自原作者仓库，本仓库作者未做任何功能性修改。

## 上游信息

| 项 | 内容 |
| --- | --- |
| 原项目名 | 合成大奶娃（BigNaiWa） |
| 原作者/上游仓库 | <https://github.com/YHSome/BigNaiWa> |
| 上游在线游玩地址 | <https://yhsome.github.io/BigNaiWa/> |
| 上游默认分支 | `main` |
| 本镜像拉取时间 | 2026-10-02 22:34 (GMT+8) |
| 快照提交 | `1c43d40b293b40224e913d3bc7f2dda24c9548e9` (`1c43d40`) |
| 快照提交时间 | 2026-10-01 20:14:06 |
| 快照提交说明 | 修「用完复活币后左上角数量不变」 |

## 本项目相对上游的改动

只有本说明文件，以及 `README.md` 顶部新增的一行来源提示。**游戏源码、素材、构建脚本未作任何修改。**

可通过以下命令查看完整差异（相对上游快照）：

```bash
git diff 1c43d40
```

## 关于本仓库的用途与边界

- 用途：个人学习、备份、离线可玩副本。
- **请勿在本仓库提交 issue 或 pull request** —— 问题请反馈至上游 [YHSome/BigNaiWa](https://github.com/YHSome/BigNaiWa)。
- 本仓库不代表原作者观点，也未获得原作者的官方背书（除非上游另有说明）。
- 本仓库不对上游代码的安全性、正确性、持续可用性作任何保证；如上游更新，本镜像可能滞后。

## 著作权

游戏的代码、美术素材、文案等一切内容的著作权均归 **原作者（YHSome）** 所有。
本仓库仅作镜像存储，不主张任何权利，亦不构成授权。

如需使用、分发或二次开发，请先查看上游仓库是否附带许可证（LICENSE）并遵守其条款；
若上游未声明许可证，则默认保留全部权利，请务必先联系原作者获得许可。

## 维护方式（同步上游）

```bash
git remote -v                       # 确认已有名为 upstream 的远程
git fetch upstream                  # 没有则先：
                                    # git remote add upstream https://github.com/YHSome/BigNaiWa.git
git merge upstream/main             # 或 git rebase upstream/main
git push origin main
```
