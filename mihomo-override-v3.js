// Sub-Store 覆写脚本
function main(config) {
  // ====== 常量配置 ======
  const SETTINGS = {
    FILTER_REGEX: /群|邀请|返利|官网|官方|网址|订阅|购买|续费|剩余|到期|过期|流量|备用|邮箱|客服|联系|工单|倒卖|防止|梯子|tg|telegram|电报|发布|重置/i,
    FORCE_DOMAIN: [
      "+.openai.com", "+.chat.com", "+.chatgpt.com", "+.oaistatic.com", "+.oaiusercontent.com", "+.sora.com",
      "+.anthropic.com", "+.claude.ai", "+.claude.com", "+.claudeusercontent.com",
      "+.gemini.google.com", "+.aistudio.google.com", "+.generativelanguage.googleapis.com", "+.makersuite.google.com", "+.notebooklm.google.com"
    ]
  };

  // ====== 节点匹配 ======
  const escapeRegex = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uniq = (arr = []) => [...new Set(arr.filter(Boolean))];

  const normalizeName = (name = "") => String(name)
    .replace(/(IEPL|IPLC|BGP|RELAY|PRO|V\d+)/ig, " $1 ")
    .replace(/[【】\[\]（）()|_\-.,/:~]/g, " ")
    .replace(/🇭🇰/g, " HK ")
    .replace(/🇸🇬/g, " SG ")
    .replace(/🇯🇵/g, " JP ")
    .replace(/🇺🇸/g, " US ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  const buildRegex = (arr = []) => {
    const patterns = arr.map((raw) => {
      const token = String(raw).trim().toUpperCase();
      const escaped = escapeRegex(token);
      if (/^[A-Z]{2,3}$/.test(token)) {
        return `(?:^|[^A-Z])${escaped}(?:[^A-Z]|$)`;
      }
      return escaped;
    });
    return new RegExp(patterns.join("|"), "i");
  };

  const REGIONS = [
    { name: "🇭🇰 香港", pattern: ["香港", "HK", "HKG", "HONGKONG", "HONG KONG"] },
    { name: "🇸🇬 新加坡", pattern: ["新加坡", "SG", "SGP", "SINGAPORE", "SIN"] },
    { name: "🇯🇵 日本", pattern: ["日本", "JP", "JPN", "JAPAN", "TOKYO", "OSAKA", "NRT", "HND", "TYO"] },
    {
      name: "🇺🇸 美国",
      pattern: [
        "美国", "纽约", "洛杉矶", "旧金山", "圣何塞", "西雅图", "芝加哥", "达拉斯", "硅谷",
        "US", "USA", "UNITEDSTATES", "UNITED STATES", "NEWYORK", "NEW YORK",
        "LOSANGELES", "LOS ANGELES", "SANFRANCISCO", "SAN FRANCISCO", "SANJOSE", "SAN JOSE",
        "SEATTLE", "CHICAGO", "DALLAS", "LAX", "SJC", "SFO"
      ]
    }
  ].map((r) => ({ ...r, regex: buildRegex(r.pattern) }));

  const LANDING_REGEX = /家宽|落地|Frontier|Residential/i;

  const ensureConfigObject = (input) => (input && typeof input === "object" ? input : {});
  const getOriginalProxies = (input) => Array.isArray(input.proxies) ? input.proxies : [];

  const makeProxyNamesUnique = (proxies = []) => {
    const used = new Set();
    const nextIdx = new Map();

    proxies.forEach((p) => {
      if (!p?.name) return;
      const base = String(p.name);
      if (!used.has(base)) {
        used.add(base);
        nextIdx.set(base, 1);
        return;
      }
      let idx = nextIdx.get(base) ?? 1;
      let candidate = `${base}_${idx}`;
      while (used.has(candidate)) {
        idx += 1;
        candidate = `${base}_${idx}`;
      }
      p.name = candidate;
      used.add(candidate);
      nextIdx.set(base, idx + 1);
    });
  };

  const splitInfoAndNormalProxies = (proxies = [], filterRegex) => {
    const infoProxies = [];
    const normalProxies = [];

    proxies.forEach((proxy) => {
      if (!proxy?.name) return;
      if (filterRegex.test(proxy.name)) {
        infoProxies.push(proxy);
      } else {
        normalProxies.push(proxy);
      }
    });

    return { infoProxies, normalProxies };
  };

  const classifyProxyNames = (normalProxies = []) => {
    const regionMap = new Map(REGIONS.map((r) => [r.name, []]));
    const landing = [];
    const transit = [];

    normalProxies.forEach((proxy) => {
      const proxyName = proxy.name;
      const normName = normalizeName(proxyName);
      const isLanding = LANDING_REGEX.test(proxyName);

      if (isLanding) {
        landing.push(proxyName);
      } else {
        transit.push(proxyName);
      }

      const matchedRegion = REGIONS.find((r) => r.regex.test(normName));
      if (matchedRegion && !isLanding) {
        regionMap.get(matchedRegion.name).push(proxyName);
      }
    });

    return {
      us: uniq(regionMap.get("🇺🇸 美国") || []),
      hk: uniq(regionMap.get("🇭🇰 香港") || []),
      sg: uniq(regionMap.get("🇸🇬 新加坡") || []),
      jp: uniq(regionMap.get("🇯🇵 日本") || []),
      landing: uniq(landing),
      transit: uniq(transit)
    };
  };

  const sel = (name, proxies) => ({ name, type: "select", proxies: proxies.length ? proxies : ["DIRECT"] });

  config = ensureConfigObject(config);
  const originalProxies = getOriginalProxies(config);
  if (originalProxies.length === 0) return config;

  makeProxyNamesUnique(originalProxies);

  const { infoProxies, normalProxies } = splitInfoAndNormalProxies(originalProxies, SETTINGS.FILTER_REGEX);
  const infoNames = uniq(infoProxies.map((p) => p.name));
  const allNormalNames = uniq(normalProxies.map((p) => p.name));
  const { us, hk, sg, jp, landing, transit } = classifyProxyNames(normalProxies);
  const all = allNormalNames;
  const nonHkLanding = landing.filter((n) => !hk.includes(n));
  const aiCandidates = uniq([...us, ...sg, ...jp, ...nonHkLanding, ...transit.filter((n) => !hk.includes(n))]);
  const aiNodes = aiCandidates.length ? aiCandidates : all;

  originalProxies.forEach((p) => {
    if (LANDING_REGEX.test(p.name)) {
      p["dialer-proxy"] = "🎯 中转节点";
    }
  });

  const regionGroups = ["🇺🇸 美国", "🇭🇰 香港", "🇸🇬 新加坡", "🏠 落地节点", "🇯🇵 日本", "🎯 中转节点"];

  // ====== 基础设置 ======
  Object.assign(config, {
    "mixed-port": 8888,
    "allow-lan": true,
    mode: "rule",
    "log-level": "info",
    "unified-delay": true,
    "tcp-concurrent": true,
    "find-process-mode": "strict",
    "external-controller": "127.0.0.1:6170",
    port: 8889,
    secret: "Jacian",
    "socks-port": 8899,
    ipv6: false,
  });

  config.experimental = {
    "ignore-resolve-fail": true
  };

  config.tun = {
    enable: true,
    stack: "mixed",
    "dns-hijack": ["any:53", "tcp://any:53"],
    "strict-route": true,
    "auto-route": true,
    "auto-detect-interface": true,
    "disable-icmp-forwarding": true,
    "route-exclude-address": [
      "172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16",
      "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
      "224.0.0.0/4", "fc00::/7", "fe80::/10"
    ],
    mtu: 1280
  };

  config["url-rewrite"] = [
    "^https?:\\/\\/(www.)?(g|google)\\.cn https://www.google.com 302",
    "^https?:\\/\\/(ditu|maps).google\\.cn https://maps.google.com 302"
  ];

  // ====== DNS ======
  config.dns = {
    enable: true,
    listen: "127.0.0.1:5335",
    ipv6: false,
    "use-hosts": true,
    "use-system-hosts": true,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "cache-algorithm": "arc",
    "prefer-h3": false,
    "respect-rules": false,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    nameserver: ["https://1.1.1.1/dns-query#🚀 节点选择", "https://8.8.8.8/dns-query#🚀 节点选择"],
    "proxy-server-nameserver": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
    "direct-nameserver": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT", "system"],
    "direct-nameserver-follow-policy": true,
    "nameserver-policy": {
      "geosite:cn": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"],
      "geosite:private": "system",
      "rule-set:openai": ["https://1.1.1.1/dns-query#🤖 AI 服务", "https://8.8.8.8/dns-query#🤖 AI 服务"],
      "rule-set:anthropic": ["https://1.1.1.1/dns-query#🤖 AI 服务", "https://8.8.8.8/dns-query#🤖 AI 服务"],
      "rule-set:google-gemini": ["https://1.1.1.1/dns-query#✨ Gemini", "https://8.8.8.8/dns-query#✨ Gemini"],
      "+.didichuxing.com": "system",
      "+.didiglobal.com": "system",
      "+.didistatic.com": "system",
      "+.diditaxi.com.cn": "system",
      "+.intra.xiaojukeji.com": "system",
      "+.xiaojukeji.com": "system"
    },
    "fake-ip-filter": [
      "geosite:connectivity-check", "geosite:private", "geosite:cn",
      "+.lan", "+.local", "stun.*.*.*", "stun.*.*",
      "time.windows.com", "time.nist.gov", "time.apple.com", "time.asia.apple.com",
      "*.ntp.org.cn", "*.openwrt.pool.ntp.org", "time1.cloud.tencent.com",
      "time.ustc.edu.cn", "pool.ntp.org", "ntp.ubuntu.com",
      "ntp.aliyun.com", "ntp1.aliyun.com", "ntp2.aliyun.com", "ntp3.aliyun.com",
      "ntp4.aliyun.com", "ntp5.aliyun.com", "ntp6.aliyun.com", "ntp7.aliyun.com",
      "time1.aliyun.com", "time2.aliyun.com", "time3.aliyun.com", "time4.aliyun.com",
      "time5.aliyun.com", "time6.aliyun.com", "time7.aliyun.com", "*.time.edu.cn",
      "time1.apple.com", "time2.apple.com", "time3.apple.com", "time4.apple.com",
      "time5.apple.com", "time6.apple.com", "time7.apple.com",
      "time1.google.com", "time2.google.com", "time3.google.com", "time4.google.com",
      "music.163.com", "*.music.163.com", "*.126.net",
      "musicapi.taihe.com", "music.taihe.com", "songsearch.kugou.com", "trackercdn.kugou.com",
      "*.kuwo.cn", "api-jooxtt.sanook.com", "api.joox.com", "joox.com",
      "y.qq.com", "*.y.qq.com", "streamoc.music.tc.qq.com", "mobileoc.music.tc.qq.com",
      "isure.stream.qqmusic.qq.com", "dl.stream.qqmusic.qq.com",
      "aqqmusic.tc.qq.com", "amobile.music.tc.qq.com",
      "*.xiami.com", "*.music.migu.cn", "music.migu.cn",
      "*.msftconnecttest.com", "*.msftncsi.com", "localhost.ptlogin2.qq.com",
      "*.*.*.srv.nintendo.net", "*.*.stun.playstation.net",
      "xbox.*.*.microsoft.com", "*.ipv6.microsoft.com", "*.*.xboxlive.com",
      "speedtest.cros.wr.pvp.net", "*.local", "time.*.com",
      "*.market.xiaomi.com", "ntp.*.com",
      "+.xiaojukeji.com", "+.didichuxing.com", "+.didiglobal.com",
      "+.didistatic.com", "+.diditaxi.com.cn"
    ]
  };

  // ====== 其他 ======
  config.profile = { "store-selected": true, "store-fake-ip": false };
  config.sniffer = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": true,
    sniff: {
      HTTP: { ports: [80, "8080-8880"], "override-destination": true },
      QUIC: { ports: [443, 8443] },
      TLS: { ports: [443, 8443] }
    },
    "force-domain": SETTINGS.FORCE_DOMAIN
  };
  config["geodata-mode"] = true;
  config["geo-auto-update"] = true;
  config["geodata-loader"] = "standard";
  config["geo-update-interval"] = 24;
  config["geox-url"] = {
    geoip: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    geosite: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    mmdb: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb",
    asn: "https://github.com/xishang0128/geoip/releases/download/latest/GeoLite2-ASN.mmdb"
  };

  // ====== 代理分组 ======
  config["proxy-groups"] = [
    sel("🇺🇸 美国", ["DIRECT", "REJECT", ...us]),
    sel("🇭🇰 香港", ["DIRECT", "REJECT", ...hk]),
    sel("🇸🇬 新加坡", ["DIRECT", "REJECT", ...sg]),
    sel("🇯🇵 日本", ["DIRECT", "REJECT", ...jp]),
    sel("🏠 落地节点", ["DIRECT", "REJECT", ...landing]),
    sel("🎯 中转节点", ["DIRECT", "REJECT", ...transit]),
    infoNames.length ? sel("ℹ️ Info", ["DIRECT", ...infoNames]) : null,
    sel("🚀 节点选择", ["DIRECT", "REJECT", ...regionGroups, ...all]),
    sel("✨ Gemini", ["🚀 节点选择", "DIRECT", "REJECT", ...regionGroups, ...all]),
    sel("🤖 AI 服务", ["✨ Gemini", "DIRECT", "REJECT", ...regionGroups, ...aiNodes]),
    sel("Ⓜ️ 微软服务", ["🚀 节点选择", "DIRECT", "REJECT", ...regionGroups, ...all]),
    sel("🍎 苹果服务", ["🚀 节点选择", "DIRECT", "REJECT", ...regionGroups, ...all]),
    sel("🛑 广告拦截", ["REJECT", "DIRECT", "🚀 节点选择"]),
    sel("🏠 私有网络", ["DIRECT", "REJECT", ...regionGroups, "🚀 节点选择", ...all]),
    sel("🔒 国内服务", ["DIRECT", "REJECT", ...regionGroups, "🚀 节点选择", ...all]),
    sel("🌍 非中国", ["🚀 节点选择", "DIRECT", "REJECT", ...regionGroups, ...all]),
    sel("🐟 漏网之鱼", ["🚀 节点选择", "DIRECT", "REJECT", ...regionGroups, ...all])
  ].filter(Boolean);

  // ====== 规则提供者 ======
  const B = "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  const dp = (n) => ({ type: "http", behavior: "domain", url: `${B}/geosite/${n}.mrs`, path: `./ruleset/${n}.mrs`, interval: 86400, format: "mrs" });
  const ip = (n) => ({ type: "http", behavior: "ipcidr", url: `${B}/geoip/${n}.mrs`, path: `./ruleset/${n}-ip.mrs`, interval: 86400, format: "mrs" });

  config["rule-providers"] = {
    "category-ads-all": dp("category-ads-all"),
    "private": dp("private"),
    "private-ip": ip("private"),
    "geolocation-cn": dp("geolocation-cn"),
    "cn-ip": ip("cn"),
    "geolocation-!cn": dp("geolocation-!cn"),
    "category-ai-chat-!cn": dp("category-ai-chat-!cn"),
    "openai": dp("openai"),
    "anthropic": dp("anthropic"),
    "google-gemini": dp("google-gemini"),
    "microsoft": dp("microsoft"),
    "onedrive": dp("onedrive"),
    "apple": dp("apple"),
    "icloud": dp("icloud"),
    "cn": dp("cn")
  };

  // ====== 规则 ======
  config.rules = [
    "RULE-SET,category-ads-all,🛑 广告拦截",
    "RULE-SET,google-gemini,✨ Gemini",
    "RULE-SET,category-ai-chat-!cn,🤖 AI 服务",
    "RULE-SET,openai,🤖 AI 服务",
    "RULE-SET,anthropic,🤖 AI 服务",
    "RULE-SET,private,🏠 私有网络",
    "RULE-SET,geolocation-cn,🔒 国内服务",
    "RULE-SET,microsoft,Ⓜ️ 微软服务",
    "RULE-SET,onedrive,Ⓜ️ 微软服务",
    "RULE-SET,apple,🍎 苹果服务",
    "RULE-SET,icloud,🍎 苹果服务",
    "RULE-SET,geolocation-!cn,🌍 非中国",
    "RULE-SET,cn,🔒 国内服务",
    "RULE-SET,private-ip,🏠 私有网络,no-resolve",
    "RULE-SET,cn-ip,🔒 国内服务,no-resolve",
    "MATCH,🐟 漏网之鱼"
  ];

  config.proxies = originalProxies;
  return config;
}
