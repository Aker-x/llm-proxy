# ECS Targets

鏈」鐩綋鍓嶇淮鎶や袱鍙?ECS銆備袱鍙版満鍣ㄨ繍琛屽悓涓€濂?`llm-proxy / llm-delegate` 浠ｇ爜锛屼絾鏁版嵁搴撱€丷edis銆丆LIProxy auth/config銆佽繍琛屾棩蹇楀拰涓氬姟鏁版嵁鐩镐簰鐙珛銆?

閮ㄧ讲浠ｇ爜鍙洿鏂拌閫変腑鐨?ECS锛屼笉浼氬悓姝ュ彟涓€鍙?ECS 鐨勬暟鎹€傚浠戒篃鍙浠借閫変腑鐨?ECS銆?

## 鐩爣娓呭崟

| 鐩爣 | 鍏綉 IP | 瀹炰緥 ID | 涓绘満鍚?| 璇存槑 |
|------|---------|---------|--------|------|
| `ecs2` | `43.106.12.39` | `i-t4ndf2e41u6bvin6n0nv` | `iZt4ndf2e41u6bvin6n0nvZ` | 褰撳墠涓昏杩愯鐜锛屽寘鍚凡鏈変笟鍔℃暟鎹拰 CLIProxy 瀹炰緥 |
| `ecs2` | `43.106.12.39` | `i-t4n5wcn1ykvqrwj26j30` | `iZt4n5wcn1ykvqrwj26j30Z` | 绗簩濂楀悓浠ｇ爜鐜锛屾暟鎹嫭绔嬶紝宸查儴缃?CLIProxy 瀹炰緥 |

## 鎺ㄨ崘鍏ュ彛

| 鎿嶄綔 | ECS2 | ECS2 |
|------|------|------|
| 閮ㄧ讲 | `deploy-ecs.bat` 鎴?`deploy-ecs2.bat` | `deploy-ecs2.bat` |
| SSH | `ssh-ecs.bat` 鎴?`ssh-ecs2.bat` | `ssh-ecs2.bat` |
| 杩滅▼鍛戒护 | `exec-ecs.bat` 鎴?`exec-ecs2.bat` | `exec-ecs2.bat` |
| 鏁版嵁澶囦唤 | `backup-ecs-data.bat` 鎴?`backup-ecs-data-ecs2.bat` | `backup-ecs-data-ecs2.bat` |

PowerShell 鑴氭湰鐨勪富鐩爣鍚嶆槸 `ecs2`锛?

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-to-ecs.ps1 -Target ecs2
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-to-ecs.ps1 -Target ecs2
```

鐩爣鍚嶅彧浣跨敤 `ecs2`銆傚悗缁枃妗ｃ€佽剼鏈垨杩愮淮鍛戒护閲屼笉瑕佷娇鐢ㄥ甫鏃堕棿鍚箟鐨勫懡鍚嶃€?

## 楠岃瘉鍛戒护

```powershell
.\exec-ecs2.bat -RemoteCommand "hostname"
.\exec-ecs2.bat -RemoteCommand "hostname"

curl.exe -fsS -I --max-time 15 http://43.106.12.39/
curl.exe -fsS -I --max-time 15 http://43.106.12.39/
```

## 鎿嶄綔鍘熷垯

- 鎿嶄綔鐢熶骇鐩稿叧鏁版嵁鍓嶅厛澶囦唤瀵瑰簲 ECS銆?
- 涓嶈鎶?ECS2 鐨勬暟鎹簱銆丷edis 鎴?CLIProxy auth 鐩綍鐩存帴瑕嗙洊鍒?ECS2锛岄櫎闈炴槑纭鍋氭暟鎹縼绉汇€?
- 涓嶈鎶?ECS2 鐨勭┖鏁版嵁鎴栨祴璇曟暟鎹悓姝ュ洖 ECS2銆?
- 鏂囨。銆佽剼鏈拰杩愮淮璇存槑缁熶竴浣跨敤 `ecs2` 鍛藉悕锛岄伩鍏嶄娇鐢ㄥ甫鏃堕棿鍚箟鐨勮娉曘€?

## CLIProxyAPI

涓ゅ彴 ECS 褰撳墠閮介儴缃蹭簡涓や釜骞崇瓑缂栧彿鐨?CLIProxyAPI 瀹炰緥锛?

| 瀹炰緥 | API 绔彛 | 绠＄悊绔彛 | 閰嶇疆鏂囦欢 | auth 鐩綍 |
|------|----------|----------|----------|-----------|
| `cliproxy-1` | `8317` | `1455` | `/root/cliproxy-config-1.yaml` | `/root/.cli-proxy-api-1` |
| `cliproxy-2` | `8318` | `1456` | `/root/cliproxy-config-2.yaml` | `/root/.cli-proxy-api-2` |

ECS2 鍜?ECS2 鐨?`llm-delegate` 鏁版嵁搴撱€丷edis銆佺粺璁″拰涓氬姟鏁版嵁浠嶇劧鐩镐簰鐙珛銆侰LIProxyAPI 鎺堟潈鏂囦欢鐩墠宸插悓姝ュ埌 ECS2锛屼絾鍚庣画缁存姢鏃朵粛搴旀寜鐩爣 ECS 鍒嗗埆纭銆?

## SSH 瀵嗛挜

ECS2 鍜?ECS2 褰撳墠鍏辩敤鍚屼竴濂?SSH 瀵嗛挜銆傝剼鏈粯璁ゆ寜浠ヤ笅椤哄簭鏌ユ壘锛?

```text
deploy/ssh/id_rsa
~/.ssh/id_rsa_sg
~/.ssh/id_rsa
```

濡傞渶涓存椂浣跨敤鍏朵粬瀵嗛挜锛屽彲浠ュ湪鍛戒护涓€氳繃 `-KeyFile` 鏄惧紡鎸囧畾銆?

