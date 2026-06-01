const fs = require('fs/promises');
const path = require('path');
const { createHttpError } = require('../utils/http-error');

const DEFAULT_AUTH_DIRS = ['/root/.cli-proxy-api-1', '/root/.cli-proxy-api-2'];
const DEFAULT_USAGE_TIMEOUT_MS = 10_000;
const MAX_AUTH_FILE_BYTES = 1024 * 1024;
const MAX_SCAN_DEPTH = 1;
const DISABLED_DIR_PATTERN = /^disabled(?:-|$)/i;
const PATH_SEPARATOR_PATTERN = /[\\/]/;

function parseAuthDirs(value) {
    const rawDirs = String(value || '')
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean);

    return rawDirs.length > 0 ? rawDirs : DEFAULT_AUTH_DIRS;
}

function toAuthTargets(authDirs) {
    return authDirs.map((authDir, index) => ({
        id: String(index + 1),
        label: String(index + 1),
        rootDir: path.resolve(authDir),
    }));
}

function parseBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    }
    return false;
}

function clampPercent(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return null;
    }
    return Math.max(0, Math.min(100, Math.round(numericValue * 10) / 10));
}

function parseDateValue(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        return null;
    }

    if (typeof value === 'number') {
        const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
        const parsed = new Date(milliseconds);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d+$/.test(trimmed)) {
            return parseDateValue(Number(trimmed));
        }
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function toIso(value) {
    const parsed = parseDateValue(value);
    return parsed ? parsed.toISOString() : null;
}

function decodeBase64UrlJson(value) {
    if (!value) {
        return null;
    }

    try {
        const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch {
        return null;
    }
}

function decodeJwtPayload(token) {
    const parts = String(token || '').split('.');
    if (parts.length < 2) {
        return null;
    }
    return decodeBase64UrlJson(parts[1]);
}

function getJwtSubscriptionInfo(authData) {
    const payload = decodeJwtPayload(authData?.id_token);
    const authClaim = payload?.['https://api.openai.com/auth'] || {};
    const subscriptionActiveUntil = toIso(authClaim.chatgpt_subscription_active_until);

    if (!payload && !Object.keys(authClaim).length) {
        return null;
    }

    return {
        email: payload?.email || null,
        planType: authClaim.chatgpt_plan_type || null,
        accountId: authClaim.chatgpt_account_id || null,
        subscriptionActiveStart: toIso(authClaim.chatgpt_subscription_active_start),
        subscriptionActiveUntil,
        subscriptionLastChecked: toIso(authClaim.chatgpt_subscription_last_checked),
        idTokenExpiresAt: toIso(payload?.exp),
    };
}

function createUnavailableQuota(message = '未返回此额度') {
    return {
        remainingPercent: null,
        resetAt: null,
        status: 'unavailable',
        message,
    };
}

function createQuotaWindow({ usedPercent, resetAt, tierName }) {
    const remainingPercent = clampPercent(100 - Number(usedPercent));
    return {
        remainingPercent,
        resetAt: toIso(resetAt),
        status: remainingPercent === null ? 'unavailable' : 'ok',
        tierName: tierName || null,
        message: remainingPercent === null ? '暂无数据' : null,
    };
}

function inferProvider(authData, filePath) {
    const haystack = [
        authData?.type,
        authData?.provider,
        authData?.tool,
        path.basename(filePath),
    ].join(' ').toLowerCase();

    if (haystack.includes('claude') || haystack.includes('anthropic')) {
        return 'claude';
    }
    if (
        haystack.includes('codex')
        || haystack.includes('openai')
        || haystack.includes('chatgpt')
        || haystack.includes('gpt')
    ) {
        return 'gpt';
    }
    if (authData?.account_id) {
        return 'gpt';
    }
    return 'unknown';
}

function getProviderLabel(provider) {
    switch (provider) {
        case 'gpt':
            return 'GPT';
        case 'claude':
            return 'Claude';
        default:
            return '未知类型';
    }
}

function getAccessToken(authData) {
    return authData?.access_token
        || authData?.tokens?.access_token
        || authData?.oauth?.access_token
        || authData?.claudeAiOauth?.accessToken
        || authData?.['claude.ai_oauth']?.accessToken
        || null;
}

function getLifecycle(authData, isDisabledPath, jwtSubscription = null) {
    const disabled = parseBoolean(authData?.disabled) || isDisabledPath;
    if (disabled) {
        return {
            status: 'disabled',
            label: '已停用',
            expiresAt: null,
            detail: '文件位于停用目录或已标记停用',
        };
    }

    const jwtExpiresAt = parseDateValue(jwtSubscription?.subscriptionActiveUntil);
    if (jwtExpiresAt) {
        const now = Date.now();
        const daysRemaining = (jwtExpiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
        if (daysRemaining < 0) {
            return {
                status: 'expired',
                label: '已到期',
                expiresAt: jwtExpiresAt.toISOString(),
                detail: '订阅已到期',
                source: 'id_token',
            };
        }
        if (daysRemaining <= 7) {
            return {
                status: 'expiring',
                label: '即将到期',
                expiresAt: jwtExpiresAt.toISOString(),
                detail: '订阅 7 天内到期',
                source: 'id_token',
            };
        }
        return {
            status: 'active',
            label: '有效',
            expiresAt: jwtExpiresAt.toISOString(),
            detail: '订阅有效',
            source: 'id_token',
        };
    }

    const subscriptionExpired = authData?.subscription_expired ?? authData?.subscriptionExpired;
    if (subscriptionExpired === true || String(subscriptionExpired).toLowerCase() === 'true') {
        return {
            status: 'expired',
            label: '已到期',
            expiresAt: null,
            detail: 'auth 文件已标记到期',
            source: 'auth_file',
        };
    }

    const expiresAt = parseDateValue(
        authData?.subscription_expires_at
        ?? authData?.subscriptionExpiresAt
        ?? authData?.subscription_expired_at
        ?? authData?.subscriptionExpiredAt
    );
    if (!expiresAt) {
        return {
            status: 'unknown',
            label: '未提供',
            expiresAt: null,
            detail: 'auth 文件未包含订阅到期时间',
            source: null,
        };
    }

    const now = Date.now();
    const daysRemaining = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
    if (daysRemaining < 0) {
        return {
            status: 'expired',
            label: '已到期',
            expiresAt: expiresAt.toISOString(),
            detail: '订阅已到期',
            source: 'auth_file',
        };
    }
    if (daysRemaining <= 7) {
        return {
            status: 'expiring',
            label: '即将到期',
            expiresAt: expiresAt.toISOString(),
            detail: '订阅 7 天内到期',
            source: 'auth_file',
        };
    }
    return {
        status: 'active',
        label: '有效',
        expiresAt: expiresAt.toISOString(),
        detail: '订阅有效',
        source: 'auth_file',
    };
}

function normalizeCodexUsage(body) {
    const windows = [
        body?.rate_limit?.primary_window,
        body?.rate_limit?.secondary_window,
    ].filter(Boolean);
    const result = {
        fiveHour: createUnavailableQuota('未返回 5 小时额度'),
        sevenDay: createUnavailableQuota('未返回 7 天额度'),
    };

    for (const window of windows) {
        const limitSeconds = Number(window?.limit_window_seconds);
        const quotaWindow = createQuotaWindow({
            usedPercent: window?.used_percent,
            resetAt: window?.reset_at,
            tierName: limitSeconds === 18000 ? 'five_hour' : limitSeconds === 604800 ? 'seven_day' : null,
        });
        if (limitSeconds === 18000) {
            result.fiveHour = quotaWindow;
        } else if (limitSeconds === 604800) {
            result.sevenDay = quotaWindow;
        }
    }

    return {
        planType: body?.plan_type || null,
        quota: result,
    };
}

function normalizeClaudeUsage(body) {
    function tierToQuota(tierName, tier) {
        if (!tier) {
            return createUnavailableQuota();
        }
        return createQuotaWindow({
            usedPercent: tier.utilization,
            resetAt: tier.resets_at,
            tierName,
        });
    }

    const weeklyCandidates = ['seven_day', 'seven_day_opus', 'seven_day_sonnet']
        .map((tierName) => tierToQuota(tierName, body?.[tierName]))
        .filter((quota) => quota.status === 'ok');
    const weekly = weeklyCandidates.length > 0
        ? weeklyCandidates.sort((left, right) => left.remainingPercent - right.remainingPercent)[0]
        : createUnavailableQuota();

    return {
        planType: null,
        quota: {
            fiveHour: body?.five_hour ? tierToQuota('five_hour', body.five_hour) : createUnavailableQuota('未返回 5 小时额度'),
            sevenDay: weekly,
        },
    };
}

class AuthManagementService {
    constructor({
        authDirs = parseAuthDirs(process.env.CLIPROXY_AUTH_DIRS),
        fetchImpl = global.fetch,
        timeoutMs = Number(process.env.CLIPROXY_AUTH_USAGE_TIMEOUT_MS || DEFAULT_USAGE_TIMEOUT_MS),
    } = {}) {
        this.authDirs = authDirs.map((authDir) => path.resolve(authDir));
        this.authTargets = toAuthTargets(this.authDirs);
        this.fetchImpl = fetchImpl;
        this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_USAGE_TIMEOUT_MS;
    }

    async getAuthFiles() {
        const files = await this.scanAuthFiles();
        const records = await Promise.all(files.map((file) => this.buildAuthFileRecord(file)));

        return {
            authTargets: this.authTargets.map(({ id, label }) => ({ id, label })),
            authFiles: records.sort((left, right) => {
                const leftKey = `${left.targetId || ''}/${left.relativePath || left.fileName || ''}`;
                const rightKey = `${right.targetId || ''}/${right.relativePath || right.fileName || ''}`;
                return leftKey.localeCompare(rightKey);
            }),
            scannedAt: new Date().toISOString(),
        };
    }

    async scanAuthFiles() {
        const results = [];
        for (const target of this.authTargets) {
            results.push(...await this.scanDirectory(target, target.rootDir, 0));
        }
        return results;
    }

    async scanDirectory(target, currentDir, depth) {
        let entries;
        try {
            entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch (error) {
            if (error.code === 'ENOENT' || error.code === 'EACCES') {
                return [];
            }
            throw error;
        }

        const files = [];
        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);
            if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                files.push({
                    targetId: target.id,
                    targetLabel: target.label,
                    rootDir: target.rootDir,
                    filePath: entryPath,
                    relativePath: path.relative(target.rootDir, entryPath),
                });
            } else if (
                entry.isDirectory()
                && depth < MAX_SCAN_DEPTH
                && !DISABLED_DIR_PATTERN.test(entry.name)
            ) {
                files.push(...await this.scanDirectory(target, entryPath, depth + 1));
            }
        }
        return files;
    }

    getTarget(targetId) {
        const normalizedTargetId = String(targetId || '').trim();
        const target = this.authTargets.find((item) => item.id === normalizedTargetId);
        if (!target) {
            throw createHttpError(400, '请选择有效的授权目录。');
        }
        return target;
    }

    resolveTopLevelAuthFile(targetId, fileName) {
        const target = this.getTarget(targetId);
        const normalizedFileName = String(fileName || '').trim();
        if (!normalizedFileName || normalizedFileName.includes('\0')) {
            throw createHttpError(400, 'auth 文件名无效。');
        }
        if (!normalizedFileName.toLowerCase().endsWith('.json')) {
            throw createHttpError(400, 'auth 文件名必须以 .json 结尾。');
        }
        if (
            normalizedFileName === '.'
            || normalizedFileName === '..'
            || PATH_SEPARATOR_PATTERN.test(normalizedFileName)
            || normalizedFileName !== path.basename(normalizedFileName)
            || normalizedFileName !== path.win32.basename(normalizedFileName)
        ) {
            throw createHttpError(400, 'auth 文件名不能包含路径。');
        }

        const resolvedPath = path.resolve(target.rootDir, normalizedFileName);
        const relativePath = path.relative(target.rootDir, resolvedPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw createHttpError(400, 'auth 文件路径无效。');
        }

        return {
            target,
            filePath: resolvedPath,
            relativePath,
            fileName: normalizedFileName,
        };
    }

    async createAuthFile({ targetId, fileName, content } = {}) {
        const resolved = this.resolveTopLevelAuthFile(targetId, fileName);
        const text = String(content || '').trim();
        const byteLength = Buffer.byteLength(text, 'utf8');
        if (!text) {
            throw createHttpError(400, 'auth 文件内容不能为空。');
        }
        if (byteLength > MAX_AUTH_FILE_BYTES) {
            throw createHttpError(400, 'auth 文件不能超过 1MB。');
        }

        try {
            JSON.parse(text);
        } catch {
            throw createHttpError(400, 'auth 文件内容必须是合法 JSON。');
        }

        try {
            await fs.mkdir(resolved.target.rootDir, { recursive: true });
            await fs.writeFile(resolved.filePath, `${text}\n`, { encoding: 'utf8', flag: 'wx' });
        } catch (error) {
            if (error.code === 'EEXIST') {
                throw createHttpError(409, '同名 auth 文件已存在。');
            }
            if (error.code === 'EACCES' || error.code === 'EROFS') {
                throw createHttpError(403, '当前服务没有写入 auth 目录的权限。');
            }
            throw error;
        }

        return {
            ok: true,
            authFile: await this.buildAuthFileRecord({
                targetId: resolved.target.id,
                targetLabel: resolved.target.label,
                rootDir: resolved.target.rootDir,
                filePath: resolved.filePath,
                relativePath: resolved.relativePath,
            }),
        };
    }

    async deleteAuthFile({ targetId, fileName } = {}) {
        const resolved = this.resolveTopLevelAuthFile(targetId, fileName);
        try {
            await fs.unlink(resolved.filePath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw createHttpError(404, 'auth 文件不存在。');
            }
            if (error.code === 'EACCES' || error.code === 'EROFS') {
                throw createHttpError(403, '当前服务没有删除 auth 文件的权限。');
            }
            throw error;
        }

        return { ok: true };
    }

    async buildAuthFileRecord(file) {
        const baseRecord = {
            fileName: path.basename(file.filePath),
            relativePath: file.relativePath,
            targetId: file.targetId,
            targetLabel: file.targetLabel,
            account: {
                email: null,
                provider: 'unknown',
                providerLabel: getProviderLabel('unknown'),
                planType: null,
                hasAccountId: false,
            },
            lifecycle: getLifecycle({}, file.relativePath.includes('disabled')),
            quota: {
                fiveHour: createUnavailableQuota('未返回 5 小时额度'),
                sevenDay: createUnavailableQuota('未返回 7 天额度'),
            },
            lastRefreshAt: null,
            readError: null,
            usageError: null,
        };

        let authData;
        try {
            authData = JSON.parse(await fs.readFile(file.filePath, 'utf8'));
        } catch (error) {
            return {
                ...baseRecord,
                readError: `读取 auth 文件失败：${error.message}`,
            };
        }

        const provider = inferProvider(authData, file.filePath);
        const jwtSubscription = getJwtSubscriptionInfo(authData);
        const lifecycle = getLifecycle(authData, file.relativePath.includes('disabled'), jwtSubscription);
        const accessToken = getAccessToken(authData);
        const record = {
            ...baseRecord,
            account: {
                email: authData?.email || jwtSubscription?.email || null,
                provider,
                providerLabel: getProviderLabel(provider),
                planType: jwtSubscription?.planType || authData?.type || authData?.plan_type || null,
                hasAccountId: Boolean(authData?.account_id || jwtSubscription?.accountId),
            },
            lifecycle,
            subscription: jwtSubscription,
            lastRefreshAt: toIso(authData?.last_refresh),
        };

        if (!accessToken) {
            return {
                ...record,
                usageError: 'auth 文件未包含 access token',
            };
        }
        if (lifecycle.status === 'disabled') {
            return {
                ...record,
                usageError: 'auth 文件已停用，跳过额度查询',
            };
        }

        try {
            const usage = await this.queryUsage({ provider, authData, accessToken });
            return {
                ...record,
                account: {
                    ...record.account,
                    planType: usage.planType || record.account.planType,
                },
                lifecycle: record.lifecycle.status === 'unknown'
                    ? {
                        status: 'active',
                        label: '有效',
                        expiresAt: null,
                        detail: '官方额度查询成功，未返回订阅到期时间',
                    }
                    : record.lifecycle,
                quota: usage.quota,
            };
        } catch (error) {
            return {
                ...record,
                usageError: error.message,
            };
        }
    }

    async queryUsage({ provider, authData, accessToken }) {
        if (provider === 'gpt') {
            return this.queryCodexUsage({ authData, accessToken });
        }
        if (provider === 'claude') {
            return this.queryClaudeUsage({ accessToken });
        }
        return {
            planType: null,
            quota: {
                fiveHour: createUnavailableQuota('未知账号类型，暂不查询额度'),
                sevenDay: createUnavailableQuota('未知账号类型，暂不查询额度'),
            },
        };
    }

    async queryCodexUsage({ authData, accessToken }) {
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'codex-cli',
            Accept: 'application/json',
        };
        if (authData?.account_id) {
            headers['ChatGPT-Account-Id'] = authData.account_id;
        }

        const body = await this.fetchJson('https://chatgpt.com/backend-api/wham/usage', { headers });
        return normalizeCodexUsage(body);
    }

    async queryClaudeUsage({ accessToken }) {
        const body = await this.fetchJson('https://api.anthropic.com/api/oauth/usage', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'anthropic-beta': 'oauth-2025-04-20',
                Accept: 'application/json',
            },
        });
        return normalizeClaudeUsage(body);
    }

    async fetchJson(url, options) {
        if (!this.fetchImpl) {
            throw new Error('当前 Node.js 环境不支持 fetch');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        let response;
        try {
            response = await this.fetchImpl(url, {
                ...options,
                signal: controller.signal,
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('查询额度超时');
            }
            throw new Error(`查询额度失败：${error.message}`);
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            throw new Error(`查询额度失败：HTTP ${response.status}`);
        }

        return response.json();
    }
}

module.exports = {
    AuthManagementService,
    parseAuthDirs,
};
