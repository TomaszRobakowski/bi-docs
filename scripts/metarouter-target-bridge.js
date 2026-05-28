(function () {
  "use strict";

  var root = window;
  var queue = root._targetAnalyticsQueue || [];
  root._targetAnalyticsQueue = queue;

  var config = root.TargetAnalyticsConfig || {};
  var propertyMap = config.properties || {
    experienceName: "experience_name",
    experienceType: "experience_type"
  };
  var counterEvent = config.counterEvent || "event222";

  function isEmpty(value) {
    if (!value) return true;
    if (Array.isArray(value)) return value.length === 0;
    return Object.keys(value).length === 0;
  }

  function asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function getTokenValue(token, names) {
    for (var i = 0; i < names.length; i += 1) {
      if (token[names[i]]) return token[names[i]];
    }
    return "";
  }

  function normalizeToken(token) {
    var activityName = getTokenValue(token, ["activity.name", "activityName", "campaign.name", "campaignName"]);
    var activityId = getTokenValue(token, ["activity.id", "activityId", "campaign.id", "campaignId"]);
    var experienceName = getTokenValue(token, ["experience.name", "experienceName"]);
    var experienceId = getTokenValue(token, ["experience.id", "experienceId"]);

    return {
      activityName: activityName || activityId,
      activityId: activityId,
      experienceName: experienceName || experienceId,
      experienceId: experienceId
    };
  }

  function buildAnalyticsPayload(token) {
    var normalized = normalizeToken(token);
    var payload = {};

    payload[propertyMap.experienceName] = normalized.experienceName || "";
    payload[propertyMap.experienceType] = normalized.activityName || "";
    payload[counterEvent] = 1;

    return payload;
  }

  function hasRequiredPayload(payload) {
    return Boolean(payload[propertyMap.experienceName] && payload[propertyMap.experienceType]);
  }

  function getPayloadKey(payload) {
    return [payload[propertyMap.experienceName], payload[propertyMap.experienceType], payload[counterEvent]].join("|");
  }

  function sendToMetaRouter(payload, rawToken) {
    var eventName = config.eventName || "Adobe Target Decision";
    var record = {
      event: eventName,
      payload: payload,
      rawToken: rawToken,
      timestamp: new Date().toISOString()
    };

    queue.push(record);

    if (root.metaTagger && typeof root.metaTagger.track === "function") {
      root.metaTagger.track(eventName, payload);
    } else if (root.analytics && typeof root.analytics.track === "function") {
      root.analytics.track(eventName, payload);
    }

    if (typeof config.onDecision === "function") {
      config.onDecision(record);
    }
  }

  function handleTargetResponse(event) {
    var detail = event && event.detail ? event.detail : {};
    var tokens = detail.responseTokens;
    var seenPayloads = {};

    if (isEmpty(tokens)) {
      if (typeof config.onNoTokens === "function") config.onNoTokens(detail);
      return;
    }

    asArray(tokens).forEach(function (token) {
      var payload = buildAnalyticsPayload(token);
      var payloadKey = getPayloadKey(payload);

      if (seenPayloads[payloadKey]) return;
      seenPayloads[payloadKey] = true;

      if (!hasRequiredPayload(payload)) {
        if (typeof config.onMissingRequiredToken === "function") {
          config.onMissingRequiredToken({
            payload: payload,
            rawToken: token,
            detail: detail,
            missing: {
              experienceName: !payload[propertyMap.experienceName],
              experienceType: !payload[propertyMap.experienceType]
            }
          });
        }
        return;
      }

      sendToMetaRouter(payload, token);
    });
  }

  function attachWhenReady() {
    if (!root.adobe || !root.adobe.target || !root.adobe.target.event) {
      return false;
    }

    document.addEventListener(root.adobe.target.event.REQUEST_SUCCEEDED, handleTargetResponse);
    root._targetAnalyticsBridgeReady = true;
    return true;
  }

  root.TargetAnalyticsBridge = {
    attach: attachWhenReady,
    handleTargetResponse: handleTargetResponse,
    getQueue: function () {
      return queue.slice();
    }
  };

  if (!attachWhenReady()) {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (attachWhenReady() || attempts >= 40) {
        clearInterval(timer);
      }
    }, 250);
  }
})();
