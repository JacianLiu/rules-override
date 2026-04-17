// 这个版本把“静态配置”“运行时分类”“最终装配”拆开，目标是让 main 只负责串联流程。
// 阅读顺序建议：先看常量区，再看 classify/build/apply 系列函数，最后看 main。

// 静态配置：这些对象本身不依赖运行时节点信息。
const BASE_SETTINGS = {
  "mixed-port": 8888,
  "allow-lan": true,
  mode: "rule",
  "log-level": "info",
  "unified-delay": true,
  "tcp-concurrent": true,
  "find-process-mode": "off",
  "disable-keep-alive": false,
  "keep-alive-interval": 15,
  "keep-alive-idle": 300,
  "external-controller": "127.0.0.1:6170",
  port: 8889,
  secret: "Jacian",
  "socks-port": 8899,
  "ipv6": false,
};

// 独立抽出实验性开关，避免和基础端口/模式配置混在一起。
const EXPERIMENTAL_SETTINGS = { "ignore-resolve-fail": true };

// TUN 配置整体固定，仅在写回 config 时做浅拷贝，防止后续误改常量对象。
const TUN_SETTINGS = {
  enable: true,
  stack: "system",
  "dns-hijack": ["any:53", "tcp://any:53"],
  "strict-route": true,
  "auto-route": true,
  "disable-icmp-forwarding": true,
  "route-exclude-address": [
    "172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16",
    "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
    "224.0.0.0/4", "fc00::/7", "fe80::/10"
  ],
  mtu: 1420,
};

// 针对常见国内 Google 域名做重定向，减少手动改地址的成本。
const URL_REWRITE = [
  "^https?:\\/\\/(www.)?(g|google)\\.cn https://www.google.com 302",
  "^https?:\\/\\/(ditu|maps).google\\.cn https://maps.google.com 302",
];

// DNS 公共底座：这里只放 stash / mihomo 都共用的部分。
const DNS_BASE = {
  enable: true,
  listen: "127.0.0.1:5335",
  ipv6: false,
  "cache-algorithm": "arc",
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "proxy-server-nameserver-policy": { "+.cloud-nodes.com": "124.221.68.73:1053" },
  "default-nameserver": ["223.5.5.5", "119.29.29.29"],
};

// Stash 侧对滴滴域名直接走 system 解析，避免 fake-ip/远端 DNS 干扰内网与办公场景。
const DNS_POLICY_DIDI_STASH = {
  "+.didichuxing.com": "system",
  "+.didiglobal.com": "system",
  "+.didistatic.com": "system",
  "+.diditaxi.com.cn": "system",
  "+.intra.xiaojukeji.com": "system",
  "+.xiaojukeji.com": "system",
};

const DIDI_NS = ["172.24.130.235", "223.5.5.5", "1.12.12.12", "114.114.114.114"];

// mihomo 侧改为显式 nameserver 列表，便于更细地控制命中策略。
const DNS_POLICY_DIDI_MIHOMO = {
  "+.didichuxing.com": DIDI_NS,
  "+.didiglobal.com": DIDI_NS,
  "+.didistatic.com": DIDI_NS,
  "+.diditaxi.com.cn": DIDI_NS,
  "+.intra.xiaojukeji.com": DIDI_NS,
  "+.xiaojukeji.com": DIDI_NS,
};

const PROFILE_SETTINGS = { "store-selected": true, "store-fake-ip": false };

// Sniffer 固定开启，用来把纯 IP / TLS / QUIC 请求尽量映射回域名语义。
const SNIFFER_SETTINGS = {
  enable: true,
  "force-dns-mapping": true,
  "parse-pure-ip": true,
  "override-destination": true,
  sniff: {
    HTTP: { ports: [80, "8080-8880"], "override-destination": false },
    QUIC: { ports: [443, 8443] },
    TLS: { ports: [443, 8443] },
  },
};

// Geo 数据下载与更新策略集中在这里，避免散落在 applyStaticConfig 中逐项拼装。
const GEO_SETTINGS = {
  "geodata-mode": true,
  "geo-auto-update": true,
  "geodata-loader": "standard",
  "geo-update-interval": 8,
  "geox-url": {
    geoip: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    geosite: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    mmdb: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb",
    asn: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/GeoLite2-ASN.mmdb",
  },
};

// 节点分类关键字：尽量覆盖中文名、英文缩写、城市名与 emoji 命名风格。
const REGION_TOKENS = {
  美国: ["美国", "US", "USA", "UNITED STATES", "UNITEDSTATES", "NEW YORK", "NEWYORK", "LOS ANGELES", "LOSANGELES", "SAN JOSE", "SANJOSE", "SAN FRANCISCO", "SANFRANCISCO", "SEATTLE", "CHICAGO", "DALLAS", "LAX", "SJC", "SFO", "🇺🇸"],
  香港: ["香港", "HK", "HKG", "HONG KONG", "HONGKONG", "🇭🇰"],
  新加坡: ["新加坡", "狮城", "SG", "SGP", "SINGAPORE", "SIN", "🇸🇬"],
  日本: ["日本", "东京", "大阪", "JP", "JPN", "JAPAN", "TOKYO", "OSAKA", "NRT", "HND", "TYO", "🇯🇵"],
};

// 这里既决定基础地区分组顺序，也会影响 fullSelect 拼装时的候选顺序。
const REGION_GROUPS = ["🇺🇸 美国", "🇭🇰 香港", "🇸🇬 新加坡", "🏠 家宽节点", "🇯🇵 日本", "🌐 其他", "🎯 中转节点"];

const ICON_CDN_BASE = "https://testingcf.jsdelivr.net/gh/Vbaethon/HOMOMIX@main/Icon/Color";

const GROUP_ICONS = {
  "🇺🇸 美国": `${ICON_CDN_BASE}/USA.png`,
  "🇭🇰 香港": `${ICON_CDN_BASE}/Hong_Kong.png`,
  "🇸🇬 新加坡": `${ICON_CDN_BASE}/Singapore.png`,
  "🇯🇵 日本": `${ICON_CDN_BASE}/Japan.png`,
  "🏠 家宽节点": `${ICON_CDN_BASE}/Home.png`,
  "🌐 其他": `${ICON_CDN_BASE}/Other.png`,
  "🎯 中转节点": `${ICON_CDN_BASE}/Transfer.png`,
  "🚀 节点选择": `${ICON_CDN_BASE}/Niche_Link.png`,
  "✨ Gemini": `${ICON_CDN_BASE}/Google.png`,
  "🤖 AI 服务": `${ICON_CDN_BASE}/AI_Tree.png`,
  "Ⓜ️ 微软服务": `${ICON_CDN_BASE}/Microsoft.png`,
  "🍎 苹果服务": `${ICON_CDN_BASE}/Apple.png`,
  "🏠 私有网络": `${ICON_CDN_BASE}/Home.png`,
  "🔒 国内服务": `${ICON_CDN_BASE}/China.png`,
  "🐟 漏网之鱼": `${ICON_CDN_BASE}/Fish.png`,
  "🛑 广告拦截": `${ICON_CDN_BASE}/Adblock.png`,
};

// 声明式规则源：这里只描述“有什么 provider / rule”，不写组装逻辑。
const RULE_PROVIDER_DEFS = [
  { key: "category-ads-all", kind: "meta-domain", source: "category-ads-all" },
  { key: "private", kind: "meta-domain", source: "private" },
  { key: "private-ip", kind: "meta-ip", source: "private" },
  { key: "google-gemini", kind: "meta-domain", source: "google-gemini" },
  { key: "category-ai-chat-!cn", kind: "meta-domain", source: "category-ai-chat-!cn" },
  { key: "microsoft", kind: "meta-domain", source: "microsoft" },
  { key: "onedrive", kind: "meta-domain", source: "onedrive" },
  { key: "apple", kind: "meta-domain", source: "apple" },
  { key: "geolocation-!cn", kind: "meta-domain", source: "geolocation-!cn" },
  { key: "geolocation-cn", kind: "meta-domain", source: "geolocation-cn" },  // 已替换为 GEOSITE,geolocation-cn（dat 直读，含正则规则）
  { key: "cn", kind: "meta-domain", source: "cn" },    // 已替换为 GEOSITE,cn（dat 直读，无需 rule-provider）
  { key: "cn-ip", kind: "meta-ip", source: "cn" },     // 已替换为 GEOIP,CN（dat 直读，无需 rule-provider）
  { key: "supplement-cn", kind: "self-domain", source: "supplement-cn" },
  { key: "enhanced-FaaS-in-China-ip", kind: "echs-ip", source: "enhanced-FaaS-in-China", file: "enhanced-FaaS-in-China_ip.mrs" },
];

// 规则文本同样保持声明式，顺序就是最终写入配置时的匹配顺序。
const RULES = [
  "RULE-SET,category-ads-all,🛑 广告拦截",
  "RULE-SET,google-gemini,✨ Gemini",
  "RULE-SET,category-ai-chat-!cn,🤖 AI 服务",
  "RULE-SET,private,🏠 私有网络",
  "RULE-SET,geolocation-cn,🔒 国内服务",  // 已替换为 GEOSITE,geolocation-cn
  "GEOSITE,geolocation-cn,🔒 国内服务",
  "RULE-SET,microsoft,Ⓜ️ 微软服务",
  "RULE-SET,onedrive,Ⓜ️ 微软服务",
  "RULE-SET,apple,🍎 苹果服务",
  "RULE-SET,geolocation-!cn,🚀 节点选择",
  "RULE-SET,cn,🔒 国内服务",          // 已替换为 GEOSITE,cn
  "GEOSITE,cn,🔒 国内服务",
  "RULE-SET,supplement-cn,🔒 国内服务",
  "RULE-SET,private-ip,🏠 私有网络,no-resolve",
 "RULE-SET,cn-ip,🔒 国内服务,no-resolve",  // 已替换为 GEOIP,CN
  "GEOIP,CN,🔒 国内服务,no-resolve",
  "RULE-SET,enhanced-FaaS-in-China-ip,🔒 国内服务,no-resolve",
  "MATCH,🐟 漏网之鱼",
];

// 转义用户提供的 token，避免地区关键字中的特殊字符污染正则语义。
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 把一组地区 token 编译成单个正则。
// 对 US / HK 这类纯大写短 token 额外加边界，避免误命中单词内部片段。
function buildRegex(tokens) {
  return new RegExp(tokens.map((token) => {
    const source = escapeRegex(token);
    return /^[A-Z]{2}$/.test(token) ? `(?<![A-Z])${source}(?![A-Z])` : source;
  }).join("|"), "i");
}

// 统一构造分类时要用到的正则，后续所有节点分类都依赖这里的定义。
function buildRegexMap() {
  return {
    美国: buildRegex(REGION_TOKENS.美国),
    香港: buildRegex(REGION_TOKENS.香港),
    新加坡: buildRegex(REGION_TOKENS.新加坡),
    日本: buildRegex(REGION_TOKENS.日本),
    家宽: /家宽|Frontier|Residential/i,
    落地: /落地/i,
  };
}

// 运行时分类：根据节点名称把代理分到地区/家宽/其他分组。
// 返回结果既给 proxy-groups 使用，也给后续 dialer-proxy / 默认选择策略复用。
function classifyProxies(proxies, regexMap) {
  const allNames = (proxies || []).map((proxy) => proxy.name);
  const match = (regex) => allNames.filter((name) => regex.test(name));
  const matchExclude = (include, exclude) => allNames.filter((name) => include.test(name) && !exclude.test(name));
  const isJiakuan = (name) => regexMap.家宽.test(name);

  const jiakuan = match(regexMap.家宽);
  const us = matchExclude(regexMap.美国, regexMap.家宽);
  const hk = matchExclude(regexMap.香港, regexMap.家宽);
  const sg = matchExclude(regexMap.新加坡, regexMap.家宽);
  const jp = matchExclude(regexMap.日本, regexMap.家宽);
  const other = allNames.filter((name) => !isJiakuan(name) && ![regexMap.美国, regexMap.香港, regexMap.新加坡, regexMap.日本].some((regex) => regex.test(name)));
  // 这里沿用现有语义：中转节点目前以美国节点集合作为候选来源。
  const transit = [...us].filter((name) => !isJiakuan(name));

  return { allNames, jiakuan, us, hk, sg, jp, other, transit };
}

// 名称里带“落地”的节点统一挂到“🎯 中转节点”下，便于处理拨号链路。
function applyDialerProxy(proxies, regexMap) {
  (proxies || []).forEach((proxy) => {
    if (regexMap.落地.test(proxy.name)) proxy["dialer-proxy"] = "🎯 中转节点";
  });
}

// 构造基础 select 组；空组时回退到 DIRECT，避免生成非法空 proxies 列表。
function sel(name, proxies) {
  const group = { name, type: "select", proxies: proxies.length ? proxies : ["DIRECT"] };
  if (GROUP_ICONS[name]) group.icon = GROUP_ICONS[name];
  return group;
}

// 构造完整选择组：在通用入口前面放常见兜底项，后面再展开所有地区组和真实节点。
function fullSelect(name, allNames) {
  return sel(name, ["🚀 节点选择", "DIRECT", "REJECT", ...REGION_GROUPS, ...allNames]);
}

// 根据分类结果组装所有代理组。
// 这里定义的是最终用户可见的分组结构，因此顺序和候选集都尽量集中维护在一个地方。
function buildProxyGroups(classified) {
  const { allNames, us, hk, sg, jp, jiakuan, other, transit } = classified;
  return [
    sel("🇺🇸 美国", [...us]),
    sel("🇭🇰 香港", [...hk]),
    sel("🇸🇬 新加坡", [...sg]),
    sel("🇯🇵 日本", [...jp]),
    sel("🏠 家宽节点", [...jiakuan]),
    sel("🌐 其他", [...other]),
    sel("🎯 中转节点", [...transit]),
    sel("🚀 节点选择", ["DIRECT", ...REGION_GROUPS, ...allNames]),
    fullSelect("✨ Gemini", allNames),
    sel("🤖 AI 服务", ["🚀 节点选择", "🏠 家宽节点"]),
    fullSelect("Ⓜ️ 微软服务", allNames),
    fullSelect("🍎 苹果服务", allNames),
    sel("🏠 私有网络", ["DIRECT", "REJECT", ...REGION_GROUPS, "🚀 节点选择", ...allNames]),
    sel("🔒 国内服务", ["DIRECT", "REJECT", ...REGION_GROUPS, "🚀 节点选择", ...allNames]),
    fullSelect("🐟 漏网之鱼", allNames),
    sel("🛑 广告拦截", ["REJECT", "DIRECT", "🚀 节点选择"]),
  ];
}

// Stash 的 fake-ip 排除列表相对更长，单独提取出来便于维护和增删。
function buildStashFakeIpFilter() {
  return [
    "+.lan", "+.local", "stun.*.*.*", "stun.*.*",
    "time.windows.com", "time.nist.gov", "time.apple.com", "time.asia.apple.com",
    "*.ntp.org.cn", "*.openwrt.pool.ntp.org", "time1.cloud.tencent.com",
    "time.ustc.edu.cn", "pool.ntp.org", "ntp.ubuntu.com",
    ...Array.from({ length: 7 }, (_, index) => [`ntp${index + 1}.aliyun.com`, `time${index + 1}.aliyun.com`]).flat(),
    ...Array.from({ length: 7 }, (_, index) => [`time${index + 1}.apple.com`, `time${index + 1}.google.com`]).flat(),
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
    "+.didistatic.com", "+.diditaxi.com.cn",
  ];
}

// Stash 专属 DNS patch：在共用底座上补齐其 hosts / fallback / fake-ip 策略。
function buildStashDnsPatch() {
  return {
    "use-hosts": true,
    "use-system-hosts": true,
    "prefer-h3": false,
    "proxy-server-nameserver": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query", "system"],
    nameserver: [
      "180.76.76.76", "119.29.29.29", "180.184.1.1", "223.5.5.5",
      "https://223.6.6.6/dns-query#h3=true",
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query",
    ],
    fallback: [
      "https://000000.dns.nextdns.io/dns-query#h3=true",
      "https://public.dns.iij.jp/dns-query",
      "https://101.101.101.101/dns-query",
      "https://208.67.220.220/dns-query",
      "tls://8.8.4.4", "tls://1.0.0.1:853",
      "https://cloudflare-dns.com/dns-query",
      "https://dns.google/dns-query",
    ],
    "fallback-filter": {
      geoip: true,
      ipcidr: ["240.0.0.0/4", "0.0.0.0/32", "127.0.0.1/32"],
      domain: [
        "+.google.com", "+.facebook.com", "+.twitter.com", "+.youtube.com",
        "+.xn--ngstr-lra8j.com", "+.google.cn", "+.googleapis.cn",
        "+.googleapis.com", "+.gvt1.com",
      ],
    },
    "fake-ip-filter": buildStashFakeIpFilter(),
    "nameserver-policy": { "+.cloud-nodes.com": "124.221.68.73:1053", ...DNS_POLICY_DIDI_STASH },
  };
}

// mihomo 专属 DNS patch：更强调规则分流与按分组选择上游 DNS。
function buildMihomoDnsPatch() {
  return {
    "fake-ip-filter-mode": "blacklist",
    "respect-rules": true,
    nameserver: [
      "https://1.1.1.1/dns-query#🚀 节点选择",
      "https://8.8.8.8/dns-query#🚀 节点选择",
    ],
    "proxy-server-nameserver": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT", "124.221.68.73:1053", "system"],
    "direct-nameserver": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT", "system"],
    "direct-nameserver-follow-policy": true,
    "fake-ip-filter": [
      "geosite:private",
      "geosite:cn",
      "geosite:connectivity-check",
      "stun.*.*.*", "stun.*.*",
      "*.*.*.srv.nintendo.net", "*.*.stun.playstation.net",
      "xbox.*.*.microsoft.com", "*.ipv6.microsoft.com", "*.*.xboxlive.com",
      "+.xiaojukeji.com", "+.didichuxing.com", "+.didiglobal.com",
      "+.didistatic.com", "+.diditaxi.com.cn",
    ],
    "nameserver-policy": {
      "+.cloud-nodes.com": ["124.221.68.73:1053"],
      ...DNS_POLICY_DIDI_MIHOMO,
      "geosite:cn": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"],
      "geosite:private": ["system"],
      "geosite:google-cn": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"],
      "geosite:openai": ["https://1.1.1.1/dns-query#🤖 AI 服务", "https://8.8.8.8/dns-query#🤖 AI 服务"],
      "geosite:anthropic": ["https://1.1.1.1/dns-query#🤖 AI 服务", "https://8.8.8.8/dns-query#🤖 AI 服务"],
      "geosite:google-gemini": ["https://1.1.1.1/dns-query#✨ Gemini", "https://8.8.8.8/dns-query#✨ Gemini"],
    },
  };
}

// DNS 只在这里根据客户端类型分叉，避免分支逻辑散落在 main 里。
function buildDnsConfig(isStash) {
  return { ...DNS_BASE, ...(isStash ? buildStashDnsPatch() : buildMihomoDnsPatch()) };
}

// 两个小工厂函数只负责把 URL/path 转成 rule-provider 所需结构。
function domainMrs(url, path) {
  return { type: "http", behavior: "domain", url, path, interval: 86400, format: "mrs" };
}

function ipMrs(url, path) {
  return { type: "http", behavior: "ipcidr", url, path, interval: 86400, format: "mrs" };
}

// 把声明式 provider 定义转换成 mihomo 实际需要的 rule-providers 结构。
function buildRuleProvider(definition) {
  const metaBase = "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  const echsBase = "https://testingcf.jsdelivr.net/gh/echs-top/proxy@main/rules/mrs";
  // const selfBase = "https://testingcf.jsdelivr.net/gh/JacianLiu/rules-override@refs/heads/main/rules/mrs";  // 已改用 list
  const selfBase = "https://testingcf.jsdelivr.net/gh/JacianLiu/rules-override@refs/heads/main/rules/list";

  if (definition.kind === "meta-domain") {
    return domainMrs(`${metaBase}/geosite/${definition.source}.mrs`, `./ruleset/${definition.source}.mrs`);
  }

  if (definition.kind === "meta-ip") {
    return ipMrs(`${metaBase}/geoip/${definition.source}.mrs`, `./ruleset/${definition.source}-ip.mrs`);
  }

  if (definition.kind === "self-domain") {
    return { type: "http", behavior: "domain", url: `${selfBase}/${definition.source}.list`, path: `./ruleset/${definition.source}.list`, interval: 86400, format: "text" };
  }

  return ipMrs(`${echsBase}/${definition.file}`, `./ruleset/echs-${definition.source}-ip.mrs`);
}

// 遍历声明式定义，生成最终 rule-providers 字典。
function buildRuleProviders() {
  return RULE_PROVIDER_DEFS.reduce((providers, definition) => {
    providers[definition.key] = buildRuleProvider(definition);
    return providers;
  }, {});
}

// 这里保留函数包装，和 rule-providers 一样维持“声明”和“装配”分层。
function buildRules() {
  return [...RULES];
}

// 把静态配置整体写回 config。
// 这里会显式拷贝数组/对象，避免后续对 config 的修改反向污染常量区。
function applyStaticConfig(config, isStash, classified) {
  Object.assign(config, BASE_SETTINGS);
  config["experimental"] = { ...EXPERIMENTAL_SETTINGS };
  config["tun"] = { ...TUN_SETTINGS, "route-exclude-address": [...TUN_SETTINGS["route-exclude-address"]], "dns-hijack": [...TUN_SETTINGS["dns-hijack"]] };
  config["url-rewrite"] = [...URL_REWRITE];
  config["dns"] = buildDnsConfig(isStash);
  config["profile"] = { ...PROFILE_SETTINGS };
  config["sniffer"] = {
    ...SNIFFER_SETTINGS,
    sniff: {
      HTTP: { ...SNIFFER_SETTINGS.sniff.HTTP, ports: [...SNIFFER_SETTINGS.sniff.HTTP.ports] },
      QUIC: { ...SNIFFER_SETTINGS.sniff.QUIC, ports: [...SNIFFER_SETTINGS.sniff.QUIC.ports] },
      TLS: { ...SNIFFER_SETTINGS.sniff.TLS, ports: [...SNIFFER_SETTINGS.sniff.TLS.ports] },
    },
  };
  config["geodata-mode"] = GEO_SETTINGS["geodata-mode"];
  config["geo-auto-update"] = GEO_SETTINGS["geo-auto-update"];
  config["geodata-loader"] = GEO_SETTINGS["geodata-loader"];
  config["geo-update-interval"] = GEO_SETTINGS["geo-update-interval"];
  config["geox-url"] = { ...GEO_SETTINGS["geox-url"] };
  config["proxy-groups"] = buildProxyGroups(classified);
  config["rule-providers"] = buildRuleProviders();
  config["rules"] = buildRules();
}

// main 只保留装配流程：识别客户端 → 分类节点 → 写回最终配置。
// 这样后续如果要调整分类规则或 DNS 策略，只需要改对应函数，不必动入口流程。
function main(config) {
  const ua = $options?._req?.headers?.['user-agent'] || '';
  const isStash = /Stash/i.test(ua);
  console.log("这次请求 ua", ua, isStash);

  const regexMap = buildRegexMap();
  applyDialerProxy(config.proxies || [], regexMap);
  const classified = classifyProxies(config.proxies || [], regexMap);
  applyStaticConfig(config, isStash, classified);

  return config;
}
