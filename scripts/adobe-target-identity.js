(function () {
  "use strict";

  var root = window;
  var config = root.AdobeTargetIdentityConfig || {};
  var timeout = Number(config.timeout || 1500);
  var interval = Number(config.interval || 50);
  var state = {
    thirdPartyId: "",
    status: "waiting",
    source: "",
    error: ""
  };
  var callbacks = [];

  function notify() {
    if (typeof config.onStatus === "function") config.onStatus(getState());
    callbacks.slice().forEach(function (callback) {
      callback(getState());
    });
  }

  function getState() {
    return {
      thirdPartyId: state.thirdPartyId,
      status: state.status,
      source: state.source,
      error: state.error
    };
  }

  function normalizeId(value) {
    if (value === null || typeof value === "undefined") return "";
    return String(value).trim();
  }

  function readMetaRouterAnonymousId() {
    var analytics = root.analytics;
    var user;

    try {
      if (!analytics || typeof analytics.user !== "function") return "";
      user = analytics.user();
      if (!user) return "";
      if (typeof user.anonymousId === "function") return normalizeId(user.anonymousId());
      return normalizeId(user.anonymousId);
    } catch (error) {
      return "";
    }
  }

  function setReady(id, source) {
    if (!id) return "";
    state.thirdPartyId = id;
    state.status = "ready";
    state.source = source || "analytics.user().anonymousId()";
    state.error = "";
    root.dispatchEvent(new CustomEvent("AdobeTargetIdentityReady", { detail: getState() }));
    notify();
    return id;
  }

  function refresh() {
    return setReady(readMetaRouterAnonymousId(), "analytics.user().anonymousId()");
  }

  function resolve(options) {
    var resolved = refresh();
    var timeoutMs = options && typeof options.timeout === "number" ? options.timeout : timeout;
    var intervalMs = options && typeof options.interval === "number" ? options.interval : interval;
    var started = Date.now();

    if (resolved) return Promise.resolve(resolved);

    state.status = "resolving";
    state.error = "";
    notify();

    return new Promise(function (resolvePromise, rejectPromise) {
      var timer;

      function finish(id) {
        if (timer) clearInterval(timer);
        resolvePromise(id);
      }

      function fail() {
        state.status = "unavailable";
        state.error = "MetaRouter anonymous ID was not available before Adobe Target identity timeout.";
        notify();
        rejectPromise(new Error(state.error));
      }

      if (root.analytics && typeof root.analytics.ready === "function") {
        root.analytics.ready(function () {
          var id = refresh();
          if (id) finish(id);
        });
      }

      timer = setInterval(function () {
        var id = refresh();
        if (id) {
          finish(id);
          return;
        }

        if (Date.now() - started >= timeoutMs) fail();
      }, intervalMs);
    });
  }

  root.AdobeTargetIdentity = {
    getThirdPartyId: function () {
      return state.thirdPartyId || refresh();
    },
    getState: getState,
    isReady: function () {
      return Boolean(state.thirdPartyId || refresh());
    },
    onChange: function (callback) {
      if (typeof callback !== "function") return;
      callbacks.push(callback);
    },
    refresh: refresh,
    resolve: resolve
  };

  Object.defineProperty(root.AdobeTargetIdentity, "thirdPartyId", {
    get: function () {
      return root.AdobeTargetIdentity.getThirdPartyId();
    }
  });

  refresh();
})();
