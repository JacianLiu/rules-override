// Sub-Store 覆写脚本
function main(config) {
  // ====== 正则匹配规则 ======
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const buildRegex = (tokens) => new RegExp(tokens.map(token => {
    const source = escapeRegex(token);
    return /^[A-Z]{2}$/.test(token) ? `(?<![A-Z])${source}(?![A-Z])` : source;
  }).join("|"), "i");

  const REGEX = {
    美国:    buildRegex(["美国", "US", "USA", "UNITED STATES", "UNITEDSTATES", "NEW YORK", "NEWYORK", "LOS ANGELES", "LOSANGELES", "SAN JOSE", "SANJOSE", "SAN FRANCISCO", "SANFRANCISCO", "SEATTLE", "CHICAGO", "DALLAS", "LAX", "SJC", "SFO", "🇺🇸"]),
    香港:    buildRegex(["香港", "HK", "HKG", "HONG KONG", "HONGKONG", "🇭🇰"]),
    新加坡:  buildRegex(["新加坡", "狮城", "SG", "SGP", "SINGAPORE", "SIN", "🇸🇬"]),
    日本:    buildRegex(["日本", "东京", "大阪", "JP", "JPN", "JAPAN", "TOKYO", "OSAKA", "NRT", "HND", "TYO", "🇯🇵"]),
    落地:    /家宽|落地|Frontier|Residential/i,
  };

  // ====== 节点分类 ======
  const allNames = (config.proxies || []).map(p => p.name);

  const match = (regex) => allNames.filter(n => regex.test(n));
  const matchExclude = (include, exclude) => allNames.filter(n => include.test(n) && !exclude.test(n));
  const isLanding = (n) => REGEX.落地.test(n);

  const landing  = match(REGEX.落地);                              // 落地节点
  const us       = matchExclude(REGEX.美国, REGEX.落地);           // 美国（排除落地）
  const hk       = matchExclude(REGEX.香港, REGEX.落地);
  const sg       = matchExclude(REGEX.新加坡, REGEX.落地);
  const jp       = matchExclude(REGEX.日本, REGEX.落地);
  const countryRegexes = [REGEX.美国, REGEX.香港, REGEX.新加坡, REGEX.日本];
  const other    = allNames.filter(n => !isLanding(n) && !countryRegexes.some(regex => regex.test(n)));
  // const transit  = allNames.filter(n => !REGEX.落地.test(n));      // 中转节点 = 所有非落地
  // const transit  = [...us, ...jp].filter(n => !isLanding(n));
  const transit  = [...us].filter(n => !isLanding(n));
  const all      = allNames;

  // ====== 为落地节点添加 dialer-proxy ======
  (config.proxies || []).forEach(p => {
    if (REGEX.落地.test(p.name)) {
      p["dialer-proxy"] = "🎯 中转节点";
    }
  });

  // ====== 辅助函数 ======
  const sel = (name, proxies) => ({ name, type: "select", proxies: proxies.length ? proxies : ["DIRECT"] });
  const regionGroups = ["🇺🇸 美国", "🇭🇰 香港", "🇸🇬 新加坡", "🏠 落地节点", "🇯🇵 日本", "🌐 其他", "🎯 中转节点"];
  const fullSelect = (name) => sel(name, ["🚀 节点选择", "DIRECT", "REJECT", ...regionGroups, ...all]);

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
    "ipv6": false,
  });

  config["experimental"] = {
    "ignore-resolve-fail": true
  };

  config["tun"] = {
    enable: true,
    stack: "mixed",
    "dns-hijack": ["any:53", "tcp://any:53"],
    "strict-route": true,
    "auto-route": true,
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
  config["dns"] = {
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
    nameserver: ["system"],
    "proxy-server-nameserver": ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
    "nameserver-policy": {
      "+.didichuxing.com": "system", "+.didiglobal.com": "system",
      "+.didistatic.com": "system", "+.diditaxi.com.cn": "system",
      "+.intra.xiaojukeji.com": "system", "+.xiaojukeji.com": "system"
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
  config["profile"] = { "store-selected": true, "store-fake-ip": true };
  config["sniffer"] = {
    enable: true,
    "parse-pure-ip": true,
    sniff: {
      HTTP: { ports: [80, "8080-8880"], "override-destination": false },
      QUIC: { ports: [443, 8443] }, TLS: { ports: [443, 8443] }
    }
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
    sel("🇺🇸 美国",   ["DIRECT", "REJECT", ...us]),
    sel("🇭🇰 香港",   ["DIRECT", "REJECT", ...hk]),
    sel("🇸🇬 新加坡", ["DIRECT", "REJECT", ...sg]),
    sel("🇯🇵 日本",   ["DIRECT", "REJECT", ...jp]),
    sel("🏠 落地节点", ["DIRECT", "REJECT", ...landing]),
    sel("🌐 其他",   ["DIRECT", "REJECT", ...other]),
    sel("🎯 中转节点", ["DIRECT", "REJECT", ...transit]),
    sel("🚀 节点选择", ["DIRECT", "REJECT", ...regionGroups, ...all]),
    fullSelect("✨ Gemini"),
    fullSelect("🤖 AI 服务"),
    fullSelect("Ⓜ️ 微软服务"),
    fullSelect("🍎 苹果服务"),
    sel("🛑 广告拦截", ["REJECT", "DIRECT", "🚀 节点选择"]),
    sel("🏠 私有网络", ["DIRECT", "REJECT", ...regionGroups, "🚀 节点选择", ...all]),
    sel("🔒 国内服务", ["DIRECT", "REJECT", ...regionGroups, "🚀 节点选择", ...all]),
    fullSelect("🌍 非中国"),
    fullSelect("🐟 漏网之鱼")
  ];

  // ====== 规则提供者 ======
  const B = "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  const dp = (n) => ({ type: "http", behavior: "domain", url: `${B}/geosite/${n}.mrs`, path: `./ruleset/${n}.mrs`, interval: 86400, format: "mrs" });
  // const ip = (n) => ({ type: "http", behavior: "ipcidr", url: `${B}/geoip/${n}.mrs`, path: `./ruleset/${n}.mrs`, interval: 86400, format: "mrs" });
  const ip = (n) => ({ type: "http", behavior: "ipcidr", url: `${B}/geoip/${n}.mrs`, path: `./ruleset/${n}-ip.mrs`, interval: 86400, format: "mrs" });


  config["rule-providers"] = {
    "category-ads-all": dp("category-ads-all"),
    "private": dp("private"), "private-ip": ip("private"),
    "geolocation-cn": dp("geolocation-cn"), "cn-ip": ip("cn"),
    "geolocation-!cn": dp("geolocation-!cn"),
    "category-ai-chat-!cn": dp("category-ai-chat-!cn"),
    "openai": dp("openai"), "anthropic": dp("anthropic"),
    "google-gemini": dp("google-gemini"),
    "microsoft": dp("microsoft"), "onedrive": dp("onedrive"),
    "apple": dp("apple"), "icloud": dp("icloud"), "cn": dp("cn"),
    "self-cn": { type: "http", behavior: "domain", url: "https://cdn.jsdelivr.net/gh/JacianLiu/rules-override@refs/heads/main/rules/cn.list", path: "./ruleset/self-cn.list", interval: 86400, format: "text" }
  };

  // ====== 规则 ======
  config["rules"] = [
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
    "RULE-SET,self-cn,🔒 国内服务",
    "RULE-SET,private-ip,🏠 私有网络,no-resolve",
    "RULE-SET,cn-ip,🔒 国内服务,no-resolve",
    "MATCH,🐟 漏网之鱼"
  ];

  return config;
}
