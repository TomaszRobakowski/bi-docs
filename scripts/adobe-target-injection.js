(function () {
  "use strict";

  var root = window;
  var projectConfig = root.TargetProjectConfig || {};
  var config = root.AdobeTargetConsentConfig || {};
  var categoryId = config.categoryId || projectConfig.targetCategoryId;
  var targetSrc = config.targetSrc || projectConfig.targetScriptUrl || "./at.js";
  var propertyToken = config.propertyToken || projectConfig.atProperty;

  if (!categoryId || !propertyToken) {
    throw new Error("adobe-target-injection.js requires TargetProjectConfig or AdobeTargetConsentConfig. Run ./scripts/build.sh and deploy dist/.");
  }
  var identityTimeout = Number(config.identityTimeout || 1500);
  var requireMetaRouterIdentity = config.requireMetaRouterIdentity !== false;
  var statusCallback = typeof config.onStatus === "function" ? config.onStatus : function () {};

  function showTargetContent() {
    if (root.AdobeTargetFlickerHandler && typeof root.AdobeTargetFlickerHandler.show === "function") {
      root.AdobeTargetFlickerHandler.show();
    }
  }

  function readQueryParam(name) {
    try {
      return new URLSearchParams(root.location.search).get(name) || "";
    } catch (error) {
      return "";
    }
  }

  function readCookie(name) {
    var escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = document.cookie.match(new RegExp("(?:^|; )" + escapedName + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function writeCookie(name, value) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; max-age=1800; SameSite=Lax";
  }

  function resolvePageCheck() {
    var configured = config.pageCheck || readQueryParam("PageCheck") || readCookie("checked");
    return configured || "target-demo";
  }

  function buildTargetPageParams() {
    var pageCheck = resolvePageCheck();
    var thirdPartyId = root.AdobeTargetIdentity && typeof root.AdobeTargetIdentity.getThirdPartyId === "function"
      ? root.AdobeTargetIdentity.getThirdPartyId()
      : "";

    writeCookie("checked", pageCheck);
    var params = {
      at_property: propertyToken,
      PageCheck: pageCheck,
      consentCategory: categoryId,
      targetDemoPage: "target-demo",
      targetElement: "target-hero-message",
      targetPath: root.location.pathname
    };
    if (thirdPartyId) {
      params.mbox3rdPartyId = thirdPartyId;
    }
    return params;
  }

  root.targetPageParamsAll = function targetPageParamsAll() {
    return buildTargetPageParams();
  };

  root.targetPageParams = function targetPageParams() {
    return buildTargetPageParams();
  };

  if (typeof root.createConsentManagedLoader !== "function") {
    throw new Error("target-consent-wrapper.js must load before adobe-target-injection.js.");
  }

  root.AdobeTargetLoader = root.createConsentManagedLoader({
    id: "adobe-target",
    categoryId: categoryId,
    src: targetSrc,
    onBeforeLoad: function () {
      if (root.AdobeTargetFlickerHandler && typeof root.AdobeTargetFlickerHandler.hide === "function") {
        root.AdobeTargetFlickerHandler.hide();
      }
      statusCallback("waiting-for-identity");

      if (!requireMetaRouterIdentity) {
        statusCallback("loading");
        return Promise.resolve();
      }

      if (!root.AdobeTargetIdentity || typeof root.AdobeTargetIdentity.resolve !== "function") {
        throw new Error("adobe-target-identity.js must load before adobe-target-injection.js.");
      }

      return root.AdobeTargetIdentity.resolve({ timeout: identityTimeout }).then(function () {
        statusCallback("loading");
      });
    },
    onBeforeLoadError: function () {
      showTargetContent();
      statusCallback("identity-blocked");
    },
    onLoaded: function () {
      showTargetContent();
      statusCallback("loaded");
      if (root.TargetAnalyticsBridge && typeof root.TargetAnalyticsBridge.attach === "function") {
        root.TargetAnalyticsBridge.attach();
      }
    },
    onError: function () {
      showTargetContent();
      statusCallback("error");
    },
    onRevoked: function () {
      showTargetContent();
      statusCallback("revoked");
    },
    onNotConsented: function () {
      showTargetContent();
      statusCallback("waiting-for-consent");
    },
    onStateChange: function (state) {
      statusCallback(state);
    }
  });

  root.OptanonWrapper = function OptanonWrapper() {
    root.evaluateConsentManagedLoaders(root.OnetrustActiveGroups || root.OptanonActiveGroups);
  };

  setTimeout(function () {
    root.evaluateConsentManagedLoaders(root.OnetrustActiveGroups || root.OptanonActiveGroups);
  }, 250);
})();
