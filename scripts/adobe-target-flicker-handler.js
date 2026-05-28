(function () {
  "use strict";

  var root = window;
  var doc = document;
  var projectConfig = root.TargetProjectConfig || {};
  var config = root.AdobeTargetFlickerConfig || {};
  var styleId = config.styleId || "at-body-style";
  var selector = config.selector || "body";
  var timeout = Number(config.timeout || 3000);
  var hiddenStyle = config.hiddenStyle || "opacity: 0 !important";
  var categoryId = config.categoryId || projectConfig.targetCategoryId;
  var timer = null;

  function readConsentCookie(category) {
    var match = doc.cookie.match(/(?:^|; )OptanonConsent=([^;]*)/);
    if (!match) return false;
    var decoded = decodeURIComponent(match[1].replace(/\+/g, " "));
    return decoded.indexOf(category + ":1") > -1;
  }

  function buildCss() {
    if (config.css) return config.css;
    return selector + " {" + hiddenStyle + "}";
  }

  function show() {
    var style = doc.getElementById(styleId);
    if (style && style.parentNode) style.parentNode.removeChild(style);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function hide() {
    if (doc.getElementById(styleId)) return;
    var head = doc.getElementsByTagName("head")[0];
    if (!head) return;

    var style = doc.createElement("style");
    style.id = styleId;
    style.textContent = buildCss();
    head.appendChild(style);

    timer = setTimeout(show, timeout);
  }

  function hideWhenPreviouslyConsented() {
    if (config.requirePriorConsent === false || readConsentCookie(categoryId)) {
      hide();
    }
  }

  root.AdobeTargetFlickerHandler = {
    hide: hide,
    show: show,
    hideWhenPreviouslyConsented: hideWhenPreviouslyConsented
  };

  root.adobe = root.adobe || {};
  root.adobe.target = root.adobe.target || {};
  root.adobe.target.showDisplayAuthoring = show;

  hideWhenPreviouslyConsented();
})();
