(function () {
  "use strict";

  var root = window;
  var doc = document;
  var loaders = root._consentManagedLoaders || [];
  root._consentManagedLoaders = loaders;

  function normalizeGroups(activeGroups) {
    if (Array.isArray(activeGroups)) return activeGroups.join(",");
    return (activeGroups || root.OnetrustActiveGroups || root.OptanonActiveGroups || "").toString();
  }

  function hasCategory(activeGroups, categoryId) {
    var groups = "," + normalizeGroups(activeGroups).replace(/\s+/g, "") + ",";
    return groups.indexOf("," + categoryId + ",") > -1;
  }

  function removeNode(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function createScript(config) {
    var script = doc.createElement("script");
    script.id = "script-" + config.id;
    script.type = "text/javascript";
    script.async = config.async !== false;
    script.src = config.src;
    if (config.attributes) {
      Object.keys(config.attributes).forEach(function (key) {
        script.setAttribute(key, config.attributes[key]);
      });
    }
    return script;
  }

  root.createConsentManagedLoader = function createConsentManagedLoader(config) {
    if (!config || !config.id || !config.src || !config.categoryId) {
      throw new Error("createConsentManagedLoader requires id, src and categoryId.");
    }

    var loader = {
      config: config,
      isLoaded: false,
      isLoading: false,
      scriptNode: null,
      lastGroups: "",
      loadScriptAfterBeforeLoad: function loadScriptAfterBeforeLoad(groups) {
        var loader = this;
        var beforeLoadResult;

        loader.isLoading = true;

        try {
          if (typeof config.onBeforeLoad === "function") {
            beforeLoadResult = config.onBeforeLoad(groups);
          }
        } catch (error) {
          loader.isLoading = false;
          if (typeof config.onBeforeLoadError === "function") config.onBeforeLoadError(error, groups);
          return;
        }

        Promise.resolve(beforeLoadResult).then(function () {
          if (!hasCategory(loader.lastGroups, config.categoryId)) {
            loader.isLoading = false;
            if (typeof config.onNotConsented === "function") config.onNotConsented(loader.lastGroups);
            return;
          }

          loader.scriptNode = createScript(config);
          loader.scriptNode.onload = function () {
            loader.isLoading = false;
            if (typeof config.onLoaded === "function") config.onLoaded(loader.lastGroups);
          };
          loader.scriptNode.onerror = function () {
            loader.isLoading = false;
            if (typeof config.onError === "function") config.onError(loader.lastGroups);
          };
          doc.head.appendChild(loader.scriptNode);
          loader.isLoaded = true;
          if (typeof config.onStateChange === "function") config.onStateChange("loaded", loader.lastGroups);
        }).catch(function (error) {
          loader.isLoading = false;
          if (typeof config.onBeforeLoadError === "function") config.onBeforeLoadError(error, groups);
        });
      },
      checkConsentAndExecute: function checkConsentAndExecute(activeGroups) {
        var groups = normalizeGroups(activeGroups);
        var allowed = hasCategory(groups, config.categoryId);
        this.lastGroups = groups;

        if (allowed && !this.isLoaded && !this.isLoading) {
          this.loadScriptAfterBeforeLoad(groups);
          return;
        }

        if (!allowed) {
          if (this.isLoaded) {
            removeNode(this.scriptNode || doc.getElementById("script-" + config.id));
            this.scriptNode = null;
            this.isLoaded = false;
            this.isLoading = false;
            if (typeof config.onRevoked === "function") config.onRevoked(groups);
            if (typeof config.onStateChange === "function") config.onStateChange("revoked", groups);
          } else if (typeof config.onNotConsented === "function") {
            this.isLoading = false;
            config.onNotConsented(groups);
          }
        }
      }
    };

    loaders.push(loader);
    return loader;
  };

  root.evaluateConsentManagedLoaders = function evaluateConsentManagedLoaders(activeGroups) {
    loaders.forEach(function (loader) {
      loader.checkConsentAndExecute(activeGroups);
    });
  };

  root.addEventListener("OneTrustGroupsUpdated", function (event) {
    root.evaluateConsentManagedLoaders(event.detail);
  });
})();
