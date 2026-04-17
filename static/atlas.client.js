(function () {
  var cfg = window.__atlas;
  if (!cfg) return;

  var base = cfg.base || location.href;

  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string") {
      input = cfg.rewrite(input, base);
    } else if (input && typeof input === "object" && input.url) {
      var rewrittenUrl = cfg.rewrite(input.url, base);
      if (rewrittenUrl !== input.url) {
        input = new Request(rewrittenUrl, input);
      }
    }
    return nativeFetch.apply(this, [input, init]);
  };

  var nativeXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === "string") {
      args[1] = cfg.rewrite(url, base);
    }
    return nativeXhrOpen.apply(this, args);
  };

  var nativeWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (typeof url === "string") {
      url = cfg.rewrite(url, base);
    }
    return nativeWindowOpen.call(window, url, target, features);
  };

  var nativePushState = history.pushState;
  history.pushState = function (state, title, url) {
    if (typeof url === "string") {
      url = cfg.rewrite(url, base);
    }
    return nativePushState.call(history, state, title, url);
  };

  var nativeReplaceState = history.replaceState;
  history.replaceState = function (state, title, url) {
    if (typeof url === "string") {
      url = cfg.rewrite(url, base);
    }
    return nativeReplaceState.call(history, state, title, url);
  };

  var nativeAssign = location.assign.bind(location);
  location.assign = function (url) {
    return nativeAssign(cfg.rewrite(url, base));
  };

  var nativeReplace = location.replace.bind(location);
  location.replace = function (url) {
    return nativeReplace(cfg.rewrite(url, base));
  };

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target && e.target.closest && e.target.closest("a[href]");
      if (!el) return;
      var href = el.getAttribute("href");
      if (
        !href ||
        href.startsWith("javascript:") ||
        href.startsWith("#") ||
        href.startsWith("/atlas/")
      )
        return;
      e.preventDefault();
      location.href = cfg.rewrite(href, base);
    },
    true
  );

  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || !form.action) return;
      if (form.action.startsWith(location.origin + "/atlas/")) return;
      e.preventDefault();
      var action = cfg.rewrite(form.action, base);
      form.action = action;
      form.submit();
    },
    true
  );
})();
