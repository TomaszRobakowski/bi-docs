(function () {
  "use strict";

  var root = window;
  var config = root.MetaRouterTestConfig;

  if (!config || !config.writeKey || !config.analyticsUrl || !config.taggingUrl) {
    throw new Error("metarouter-loader.js requires MetaRouterTestConfig from target-config.js. Run ./scripts/build.sh and deploy dist/.");
  }

  var writeKey = config.writeKey;

  function loadScript(id, src, onload) {
    if (document.getElementById(id)) return;
    var script = document.createElement("script");
    script.id = id;
    script.type = "text/javascript";
    script.async = true;
    script.src = src;
    if (typeof onload === "function") script.onload = onload;
    document.head.appendChild(script);
  }

  root.metaTagger = root.metaTagger || {};
  root.metaTagger._queuedTrackCalls = root.metaTagger._queuedTrackCalls || [];
  var queuedTrack = function (eventName, properties) {
    root.metaTagger._queuedTrackCalls.push([eventName, properties || {}]);
  };

  if (typeof root.metaTagger.track !== "function") {
    root.metaTagger.track = queuedTrack;
  }

  function flushQueuedMetaTaggerCalls() {
    if (root.metaTagger.track === queuedTrack) return;
    var calls = root.metaTagger._queuedTrackCalls || [];
    root.metaTagger._queuedTrackCalls = [];
    calls.forEach(function (args) {
      root.metaTagger.track(args[0], args[1]);
    });
  }

  function bootstrapAnalytics() {
    var analytics = (root.analytics = root.analytics || []);
    if (analytics.initialize) return;
    if (analytics.invoked) return;

    analytics.invoked = true;
    analytics.methods = [
      "trackSubmit",
      "trackClick",
      "trackLink",
      "trackForm",
      "pageview",
      "identify",
      "reset",
      "group",
      "track",
      "ready",
      "alias",
      "debug",
      "page",
      "once",
      "off",
      "on",
      "addSourceMiddleware",
      "addIntegrationMiddleware",
      "setAnonymousId",
      "addDestinationMiddleware"
    ];
    analytics.factory = function (method) {
      return function () {
        var args = Array.prototype.slice.call(arguments);
        args.unshift(method);
        analytics.push(args);
        return analytics;
      };
    };
    analytics.methods.forEach(function (method) {
      analytics[method] = analytics.factory(method);
    });
    analytics.load = function (key, options) {
      analytics._loadOptions = options;
      loadScript("metarouter-analytics-js", config.analyticsUrl);
    };
    analytics.SNIPPET_VERSION = "4.13.1";
    analytics.load(writeKey, { host: config.host });
  }

  bootstrapAnalytics();
  loadScript("metatagger-tagging-js", config.taggingUrl, flushQueuedMetaTaggerCalls);
})();
