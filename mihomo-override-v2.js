// Sub-Store 覆写脚本
function main(config) {

  const ua = $options?._req?.headers?.['user-agent'] || '';
  const isStash = /Stash/i.test(ua);
  console.log("这次请求 ua", ua, isStash);

  // ====== 正则匹配规则 ======
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const buildRegex = (tokens) => new RegExp(tokens.map(token => {
    const source = escapeRegex(token);
    return /^[A-Z]{2}$/.test(token) ? `(?<![A-Z])${source}(?![A-Z])` : source;
  }).join("|"), "i");

  const REGEX = {
    美国:   buildRegex(["美国", "US", "USA", "UNITED STATES", "UNITEDSTATES", "NEW YORK", "NEWYORK", "LOS ANGELES", "LOSANGELES", "SAN JOSE", "SANJOSE", "SAN FRANCISCO", "SANFRANCISCO", "SEATTLE", "CHICAGO", "DALLAS", "LAX", "SJC", "SFO", "🇺🇸"]),
    香港:   buildRegex(["香港", "HK", "HKG", "HONG KONG", "HONGKONG", "🇭🇰"]),
    新加坡: buildRegex(["新加坡", "狮城", "SG", "SGP", "SINGAPORE", "SIN", "🇸🇬"]),
    日本:   buildRegex(["日本", "东京", "大阪", "JP", "JPN", "JAPAN", "TOKYO", "OSAKA", "NRT", "HND", "TYO", "🇯🇵"]),
    家宽:   /家宽|Frontier|Residential/i,
    落地:   /落地/i,
  };

  // ====== 节点分类 ======
  const allNames = (config.proxies || []).map(p => p.name);
  const match = (regex) => allNames.filter(n => regex.test(n));
  const matchExclude = (include, exclude) => allNames.filter(n => include.test(n) && !exclude.test(n));
  const isJiakuan = (n) => REGEX.家宽.test(n);

  const jiakuan = match(REGEX.家宽);
  const us      = matchExclude(REGEX.美国, REGEX.家宽);
  const hk      = matchExclude(REGEX.香港, REGEX.家宽);
  const sg      = matchExclude(REGEX.新加坡, REGEX.家宽);
  const jp      = matchExclude(REGEX.日本, REGEX.家宽);
  const other   = allNames.filter(n => !isJiakuan(n) && ![REGEX.美国, REGEX.香港, REGEX.新加坡, REGEX.日本].some(r => r.test(n)));
  const transit = [...us].filter(n => !isJiakuan(n));

  // ====== 仅含"落地"的节点加 dialer-proxy ======
  (config.proxies || []).forEach(p => {
    if (REGEX.落地.test(p.name)) p["dialer-proxy"] = "🎯 中转节点";
  });

  // ====== 辅助函数 ======
  const sel = (name, proxies) => ({ name, type: "select", proxies: proxies.length ? proxies : ["DIRECT"] });
  const regionGroups = ["🇺🇸 美国", "🇭🇰 香港", "🇸🇬 新加坡", "🏠 家宽节点", "🇯🇵 日本", "🌐 其他", "🎯 中转节点"];
  const fullSelect = (name) => sel(name, ["🚀 节点选择", "DIRECT", "REJECT", ...regionGroups, ...allNames]);

  // ====== 基础设置 ======
  Object.assign(config, {
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
  });


  config["experimental"] = { "ignore-resolve-fail": true };

  config["tun"] = {
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
    mtu: 1420
  };

  config["url-rewrite"] = [
    "^https?:\\/\\/(www.)?(g|google)\\.cn https://www.google.com 302",
    "^https?:\\/\\/(ditu|maps).google\\.cn https://maps.google.com 302"
  ];

  // ====== DNS ======
  const DNS_BASE = {
    enable: true,
    listen: "127.0.0.1:5335",
    ipv6: false,
    "cache-algorithm": "arc",
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/16",
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
  };

  const DNS_POLICY_DIDI_STASH = {
    "+.didichuxing.com":      "system",
    "+.didiglobal.com":       "system",
    "+.didistatic.com":       "system",
    "+.diditaxi.com.cn":      "system",
    "+.intra.xiaojukeji.com": "system",
    "+.xiaojukeji.com":       "system",
  };

  const DIDI_NS = ["172.24.130.235", "223.5.5.5", "1.12.12.12", "114.114.114.114"];
  const DNS_POLICY_DIDI_MIHOMO = {
    "+.didichuxing.com":      DIDI_NS,
    "+.didiglobal.com":       DIDI_NS,
    "+.didistatic.com":       DIDI_NS,
    "+.diditaxi.com.cn":      DIDI_NS,
    "+.intra.xiaojukeji.com": DIDI_NS,
    "+.xiaojukeji.com":       DIDI_NS,
  };

  const DNS_PATCH = isStash ? {
    "use-hosts": true,
    "use-system-hosts": true,
    "prefer-h3": false,
    "follow-rule": true,
    "proxy-server-nameserver": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
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
    "fake-ip-filter": [
      "+.lan", "+.local", "stun.*.*.*", "stun.*.*",
      "time.windows.com", "time.nist.gov", "time.apple.com", "time.asia.apple.com",
      "*.ntp.org.cn", "*.openwrt.pool.ntp.org", "time1.cloud.tencent.com",
      "time.ustc.edu.cn", "pool.ntp.org", "ntp.ubuntu.com",
      ...Array.from({length: 7}, (_, i) => [`ntp${i+1}.aliyun.com`, `time${i+1}.aliyun.com`]).flat(),
      ...Array.from({length: 7}, (_, i) => [`time${i+1}.apple.com`, `time${i+1}.google.com`]).flat(),
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
    ],
    "nameserver-policy": { ...DNS_POLICY_DIDI_STASH },
  } : {
    "fake-ip-filter-mode": "blacklist",
    "respect-rules": true,
    nameserver: [
      "https://1.1.1.1/dns-query#🚀 节点选择",
      "https://8.8.8.8/dns-query#🚀 节点选择",
    ],
    "proxy-server-nameserver": ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT", "system"],
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
      ...DNS_POLICY_DIDI_MIHOMO,
      "geosite:cn":            ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"],
      "geosite:private":       "system",
      "geosite:google-cn":     ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"],
      "geosite:openai":        ["https://1.1.1.1/dns-query#🤖 AI 服务", "https://8.8.8.8/dns-query#🤖 AI 服务"],
      "geosite:anthropic":     ["https://1.1.1.1/dns-query#🤖 AI 服务", "https://8.8.8.8/dns-query#🤖 AI 服务"],
      "geosite:google-gemini": ["https://1.1.1.1/dns-query#✨ Gemini",   "https://8.8.8.8/dns-query#✨ Gemini"],
    },
  };

  config["dns"] = { ...DNS_BASE, ...DNS_PATCH };

  // ====== 其他 ======
  config["profile"] = { "store-selected": true, "store-fake-ip": false };
  config["sniffer"] = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": true,
    sniff: {
      HTTP:  { ports: [80, "8080-8880"], "override-destination": false },
      QUIC:  { ports: [443, 8443] },
      TLS:   { ports: [443, 8443] },
    },
  };
  config["geodata-mode"] = true;
  config["geo-auto-update"] = true;
  config["geodata-loader"] = "standard";
  config["geo-update-interval"] = 8;
  config["geox-url"] = {
    geoip:   "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    geosite: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    mmdb:    "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb",
    asn:     "https://github.com/xishang0128/geoip/releases/download/latest/GeoLite2-ASN.mmdb",
  };

  // ====== 代理分组 ======
  config["proxy-groups"] = [
    sel("🇺🇸 美国",   [...us]),
    sel("🇭🇰 香港",   [...hk]),
    sel("🇸🇬 新加坡", [...sg]),
    sel("🇯🇵 日本",   [...jp]),
    sel("🏠 家宽节点", [...jiakuan]),
    sel("🌐 其他",     [...other]),
    sel("🎯 中转节点", [...transit]),
    sel("🚀 节点选择", ["DIRECT", ...regionGroups, ...allNames]),
    fullSelect("✨ Gemini"),
    sel("🤖 AI 服务", ["🚀 节点选择", "🏠 家宽节点"]),
    fullSelect("Ⓜ️ 微软服务"),
    fullSelect("🍎 苹果服务"),
    sel("🏠 私有网络", ["DIRECT", "REJECT", ...regionGroups, "🚀 节点选择", ...allNames]),
    sel("🔒 国内服务", ["DIRECT", "REJECT", ...regionGroups, "🚀 节点选择", ...allNames]),
    fullSelect("🐟 漏网之鱼"),
    sel("🛑 广告拦截", ["REJECT", "DIRECT", "🚀 节点选择"]),
  ];

  // ====== 规则提供者 ======
  const B  = "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  const E  = "https://cdn.jsdelivr.net/gh/echs-top/proxy@main/rules/mrs";
  const dp = (n) => ({ type: "http", behavior: "domain", url: `${B}/geosite/${n}.mrs`, path: `./ruleset/${n}.mrs`,    interval: 86400, format: "mrs" });
  const ip = (n) => ({ type: "http", behavior: "ipcidr", url: `${B}/geoip/${n}.mrs`,   path: `./ruleset/${n}-ip.mrs`, interval: 86400, format: "mrs" });
  const ep = (n, file) => ({ type: "http", behavior: "domain", url: `${E}/${file}`, path: `./ruleset/echs-${n}.mrs`, interval: 86400, format: "mrs" });
  const ei = (n, file) => ({ type: "http", behavior: "ipcidr", url: `${E}/${file}`, path: `./ruleset/echs-${n}-ip.mrs`, interval: 86400, format: "mrs" });

  config["rule-providers"] = {
    "category-ads-all":           dp("category-ads-all"),
    "private":                    dp("private"),        "private-ip":              ip("private"),
    "geolocation-cn":             dp("geolocation-cn"), "cn-ip":                   ip("cn"),
    "category-ai-chat-!cn":       dp("category-ai-chat-!cn"),
    "openai":                     dp("openai"),         "anthropic":               dp("anthropic"),
    "google-gemini":              dp("google-gemini"),
    "microsoft":                  dp("microsoft"),      "onedrive":                dp("onedrive"),
    "apple":                      dp("apple"),          "icloud":                  dp("icloud"),
    "geolocation-!cn":            dp("geolocation-!cn"),
    "cn":                         dp("cn"),
    "self-cn": {
      type: "http", behavior: "domain", format: "text", interval: 86400,
      url:  "https://cdn.jsdelivr.net/gh/JacianLiu/rules-override@refs/heads/main/rules/cn.list",
      path: "./ruleset/self-cn.list",
    },
    // 补充自 echs-top/proxy
    "fcm":                        ep("fcm",                 "fcm_domain.mrs"),
    "dnsmasq-china-add":          ep("dnsmasq-china-add",   "dnsmasq-china-add_domain.mrs"),
    "enhanced-FaaS-in-China-ip":  ei("enhanced-FaaS-in-China", "enhanced-FaaS-in-China_ip.mrs"),
  };

  // ====== 规则 ======
  config["rules"] = [
    "RULE-SET,category-ads-all,🛑 广告拦截",
    "RULE-SET,google-gemini,✨ Gemini",
    "RULE-SET,category-ai-chat-!cn,🤖 AI 服务",
    "RULE-SET,openai,🤖 AI 服务",
    "RULE-SET,anthropic,🤖 AI 服务",
    "RULE-SET,private,🏠 私有网络",
    "RULE-SET,fcm,🔒 国内服务",               // FCM 国内直连，放在 geolocation-cn 前
    "RULE-SET,geolocation-cn,🔒 国内服务",
    "RULE-SET,microsoft,Ⓜ️ 微软服务",
    "RULE-SET,onedrive,Ⓜ️ 微软服务",
    "RULE-SET,apple,🍎 苹果服务",
    "RULE-SET,icloud,🍎 苹果服务",
    "RULE-SET,geolocation-!cn,🚀 节点选择",
    "RULE-SET,cn,🔒 国内服务",
    "RULE-SET,dnsmasq-china-add,🔒 国内服务", // 补充国内域名，放在 cn 后
    "RULE-SET,self-cn,🔒 国内服务",
    "RULE-SET,private-ip,🏠 私有网络,no-resolve",
    "RULE-SET,cn-ip,🔒 国内服务,no-resolve",
    "RULE-SET,enhanced-FaaS-in-China-ip,🔒 国内服务,no-resolve", // 国内云服务商 IP
    "MATCH,🐟 漏网之鱼",
  ];

  return config;
}
