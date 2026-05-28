(function () {
  "use strict";

  var config = window.TargetProjectConfig || {};
  var domainId = config.oneTrustDomainId;

  if (!domainId) {
    throw new Error("onetrust-loader.js requires TargetProjectConfig.oneTrustDomainId. Run ./scripts/build.sh and deploy dist/.");
  }

  var baseUrl = "https://cdn.cookielaw.org/consent/" + domainId + "/";

  function loadScript(src, attributes) {
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = src;
    if (attributes) {
      Object.keys(attributes).forEach(function (key) {
        script.setAttribute(key, attributes[key]);
      });
    }
    document.head.appendChild(script);
  }

  loadScript(baseUrl + "OtAutoBlock.js");
  loadScript(baseUrl + "otSDKStub.js", {
    charset: "UTF-8",
    "data-domain-script": domainId
  });
})();
