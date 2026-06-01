# llm-delegate

鍗曟満澶氬疄渚嬬殑 LLM 浠ｇ悊鏈嶅姟锛屾彁渚涚粺涓€浠ｇ悊鍏ュ彛銆佺敤鎴?API Key 浣撶郴銆佷綑棰濊璐瑰拰绠＄悊鍚庡彴銆?

## 鎶€鏈爤

- Node.js + Express
- PostgreSQL
- Redis
- Nginx

## 杩愯鎷撴墤

- `nginx` 瀵瑰鎻愪緵缁熶竴鍏ュ彛
- `app-1`銆乣app-2`銆乣app-3` 涓変釜搴旂敤瀹炰緥鍦?Docker 鍐呯綉杩愯
- `postgres` 鍜?`redis` 浣滀负鍏变韩鍩虹璁炬柦
- `migrate` 鍦ㄥ簲鐢ㄥ惎鍔ㄥ墠鎵ц鏁版嵁搴撹縼绉?
- 鎵€鏈夊搷搴旈兘浼氬甫 `X-Proxy-Instance`锛岀敤浜庢爣璇嗗綋鍓嶈姹傜敱鍝釜瀹炰緥澶勭悊

## 蹇€熷紑濮?

寮€鍙戞満鎺ㄨ崘鐩存帴杩愯锛?

```bat
start-dev.bat
```

杩欎釜鑴氭湰浼氾細

- 妫€鏌?Docker 鏄惁鍙敤
- 鑷姩灏濊瘯鍚姩 Docker Desktop
- 鍚姩 `postgres` 鍜?`redis`
- 榛樿瀵煎叆 [`dev-data/llm_delegate.sql`](./dev-data/llm_delegate.sql)
- 鏋勫缓搴旂敤闀滃儚
- 鍚姩 `migrate + nginx + app-1/app-2/app-3`

寮€鍙戝叆鍙ｏ細

- [http://127.0.0.1:3000](http://127.0.0.1:3000)

甯哥敤鍛戒护锛?

```powershell
.\start-dev.bat -SkipImportDevData
powershell -ExecutionPolicy Bypass -File .\scripts\start-multi-instance.ps1 -Mode dev -SkipImportDevData
```

## 閮ㄧ讲姒傝

閮ㄧ讲鏈哄父鐢ㄥ叆鍙ｏ細

- Windows: [start-deploy.bat](./start-deploy.bat)锛堟湰鍦?Docker 閮ㄧ讲锛?
- Windows SSH: [ssh-ecs.bat](./ssh-ecs.bat)锛堥粯璁よ繛鎺?ECS2锛?
- Windows remote command: [exec-ecs.bat](./exec-ecs.bat)锛堥粯璁ゅ湪 ECS2 瀹夊叏鎵ц杩滅▼鍛戒护/鑴氭湰锛?
- Windows ECS 閮ㄧ讲: [deploy-ecs.bat](./deploy-ecs.bat)锛堥粯璁や竴閿瀯寤轰笂浼犻儴缃插埌 ECS2锛?
- Linux: [scripts/start-multi-instance.sh](./scripts/start-multi-instance.sh)

榛樿琛屼负锛?

- 閮ㄧ讲鍏ュ彛榛樿浣跨敤 `http://127.0.0.1`
- `.env.deploy` 榛樿 `PORT=80`
- 濡傛灉鍚屾満鏈夊叕缃?IP 涓旀斁閫?`80/tcp`锛屽彲鐩存帴閫氳繃 `http://<your-server-public-ip>/` 璁块棶
- 濡傛灉閮ㄧ讲鐩綍閲屽瓨鍦?`llm-delegate.tar`锛屽惎鍔ㄨ剼鏈細鑷姩灏濊瘯 `docker load`

### ECS 閮ㄧ讲鏀寔

褰撳墠鏈変袱鍙?ECS锛屼唬鐮佸簱淇濇寔涓€鑷达紝浣嗘暟鎹簱銆丷edis銆丆LIProxy auth/config銆佽繍琛屾暟鎹郊姝ょ嫭绔嬨€傞儴缃蹭唬鐮佸埌鍏朵腑涓€鍙颁笉浼氬悓姝ュ彟涓€鍙扮殑鏁版嵁銆?

| 鐩爣 | 鍏綉 IP | 瀹氫綅 | 鎺ㄨ崘鍏ュ彛 |
|------|---------|------|----------|
| `ecs2` | `43.106.12.39` | 褰撳墠涓昏杩愯鐜锛屼繚鐣欏凡鏈変笟鍔℃暟鎹拰 CLIProxy 瀹炰緥 | `deploy-ecs.bat`銆乣ssh-ecs.bat`銆乣exec-ecs.bat`銆乣backup-ecs-data.bat` |
| `ecs2` | `43.106.12.39` | 绗簩濂楀悓浠ｇ爜鐜锛屾暟鎹嫭绔?| `deploy-ecs2.bat`銆乣ssh-ecs2.bat`銆乣exec-ecs2.bat`銆乣backup-ecs-data-ecs2.bat` |

璇存槑锛?

- `deploy-ecs.bat` / `ssh-ecs.bat` / `exec-ecs.bat` / `backup-ecs-data.bat` 鏄?ECS2 鐨勫吋瀹归粯璁ゅ叆鍙ｃ€?
- 濡傞渶鏄惧紡鎿嶄綔 ECS2锛屼篃鍙互浣跨敤 `deploy-ecs2.bat` / `ssh-ecs2.bat` / `exec-ecs2.bat` / `backup-ecs-data-ecs2.bat`銆?
- ECS2 鍜?ECS2 閮介€傚悎闇€瑕佺洿杩?OpenAI/Claude 绛夋捣澶?API 鐨勫満鏅紝榛樿鏃犵炕澧欓渶姹傘€?
- 澶囦唤銆侀儴缃层€丼SH 鎿嶄綔鍓嶅簲纭鐩爣鏄?`ecs2` 杩樻槸 `ecs2`锛岄伩鍏嶆妸涓€鍙版満鍣ㄧ殑鏁版嵁褰撴垚鍙︿竴鍙般€?
- ECS2 鍜?ECS2 閮介儴缃蹭簡 `cliproxy-1` / `cliproxy-2`锛屽苟鏀寔鍦?ECS 涓婄洿鎺ユ媺鍙栨渶鏂?`CLIProxyAPI` 婧愮爜骞舵湰鏈烘瀯寤烘浛鎹紝涓嶄緷璧栧浐瀹?Docker Hub tag銆?

鍦ㄥ紑鍙戞満涓婃瀯寤哄苟瀵煎嚭闀滃儚锛?

```powershell
docker compose --env-file .env.deploy -f docker-compose.deploy.yml build migrate
docker save -o llm-delegate.tar llm-delegate:latest
```

Linux 鏈嶅姟鍣ㄤ篃鍙互鐩存帴鎵ц锛?

```bash
cd /root/llm-delegate
chmod +x scripts/start-multi-instance.sh
MODE=deploy ./scripts/start-multi-instance.sh
```

## 鏂囨。

- [docs/alibaba-cloud-ecs-deploy.md](./docs/alibaba-cloud-ecs-deploy.md): 闃块噷浜?ECS 閮ㄧ讲姝ラ銆佹帹鑽愯鏍笺€佸畨鍏ㄧ粍鍜岄獙娲诲懡浠?
- [docs/ecs-targets.md](./docs/ecs-targets.md): ECS2/ECS2 鐩爣銆両P銆佽剼鏈叆鍙ｅ拰鏁版嵁闅旂璇存槑
- [docs/鍙屼唬鐞嗛儴缃茶鏄庝功.md](./docs/鍙屼唬鐞嗛儴缃茶鏄庝功.md): ECS2 涓?`llm-delegate + cliproxy-1/cliproxy-2` 鐨勫綋鍓嶉儴缃茬姸鎬併€佹渶鏂版簮鐮侀儴缃叉柟寮忋€佽繛鎺ユ柟寮忓拰缁存姢鍛戒护
- [docs/cliproxy-auth-health-check.md](./docs/cliproxy-auth-health-check.md): 鏍￠獙鎵€鏈?CLIProxy 瀹炰緥鎺堟潈鏂囦欢鏄惁澶辨晥銆佹槸鍚︿粛鍙疆璇紝浠ュ強鍖哄垎棰濆害鑰楀敖/鍐峰嵈涓殑鑴氭湰璇存槑

## 閰嶇疆鏂囦欢

- [`.env.deploy`](./.env.deploy): 鍗曟満澶氬疄渚嬮儴缃查厤缃?
- [`docker-compose.deploy.yml`](./docker-compose.deploy.yml): 寮€鍙戞満澶氬疄渚?compose锛屽寘鍚暅鍍忔瀯寤?
- [`docker-compose.deploy-image.yml`](./docker-compose.deploy-image.yml): 閮ㄧ讲鏈哄瀹炰緥 compose锛岀洿鎺ヤ娇鐢ㄥ凡鏈夐暅鍍?
- [`deploy/nginx/default.conf.template`](./deploy/nginx/default.conf.template): Nginx 鍙嶅悜浠ｇ悊涓庤礋杞藉潎琛℃ā鏉?
- [Dockerfile](./Dockerfile): 搴旂敤闀滃儚鏋勫缓鏂囦欢

## Dev Data

寮€鍙戞暟鎹鍑猴細

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-dev-data.ps1
```

寮€鍙戞暟鎹鍏ワ細

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import-dev-data.ps1 -ComposeFile docker-compose.deploy.yml
```

瀵煎嚭鏂囦欢锛?

- [`dev-data/llm_delegate.sql`](./dev-data/llm_delegate.sql)
- [`dev-data/export-info.json`](./dev-data/export-info.json)

璇存槑锛?

- 鍙湁 PostgreSQL 寮€鍙戞暟鎹細琚悓姝?
- Redis session 涓嶅湪瀵煎嚭鑼冨洿鍐?
- 瀵煎叆寮€鍙戞暟鎹悗锛岃处鍙峰瘑鐮佷互瀵煎嚭鏁版嵁涓哄噯

## 榛樿璐﹀彿

绌哄簱棣栨鍒濆鍖栨椂锛岄粯璁ょ瀛愯处鍙锋潵鑷唬鐮侊細

- 绠＄悊鍛橈細`liuzhenyu / Lzy_08032211`
- 鐢ㄦ埛锛歚user / 123456`

濡傛灉瀵煎叆浜?[`dev-data/llm_delegate.sql`](./dev-data/llm_delegate.sql)锛屽垯浠ュ鍏ユ暟鎹腑鐨勮处鍙蜂负鍑嗐€?

## 鍏抽敭鏂囦欢

- [src/app.js](./src/app.js): 搴旂敤鍏ュ彛
- [src/server.js](./src/server.js): 鍚姩鍏ュ彛
- [src/bootstrap/load-env.js](./src/bootstrap/load-env.js): 鐜鍙橀噺鍔犺浇
- [src/bootstrap/create-runtime-infra.js](./src/bootstrap/create-runtime-infra.js): 杩愯鏃惰閰?
- [src/bootstrap/ensure-initial-state.js](./src/bootstrap/ensure-initial-state.js): 鍒濆绉嶅瓙
- [src/services/model-resolution-service.js](./src/services/model-resolution-service.js): 妯″瀷瑙ｆ瀽
- [src/services/proxy-service.js](./src/services/proxy-service.js): 浠ｇ悊鏍稿績
- [scripts/start-multi-instance.ps1](./scripts/start-multi-instance.ps1): 澶氬疄渚嬪惎鍔ㄨ剼鏈?
- [scripts/start-multi-instance.sh](./scripts/start-multi-instance.sh): Linux 閮ㄧ讲鍚姩鑴氭湰

## 鏃ュ織

寤鸿鐩存帴鐪?Docker 瀹瑰櫒鏃ュ織锛?

```powershell
docker compose --env-file .env.deploy -f docker-compose.deploy-image.yml logs -f
```

鎴栬€呭彧鐪嬪簲鐢ㄤ笌缃戝叧锛?

```powershell
docker compose --env-file .env.deploy -f docker-compose.deploy-image.yml logs -f nginx app-1 app-2 app-3
```

