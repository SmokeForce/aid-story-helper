"use strict";
(() => {
  // src/content/browser-helper.ts
  var g = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {};
  var rawBrowser = g.browser || g.chrome;
  var browser = rawBrowser ? new Proxy(rawBrowser, {
    get(target, prop) {
      if (prop === "runtime") {
        const runtime = target.runtime;
        if (!runtime) return void 0;
        return new Proxy(runtime, {
          get(rTarget, rProp) {
            if (rProp === "sendMessage") {
              return (...args) => {
                try {
                  if (!rTarget || !rTarget.id) {
                    return Promise.reject(new Error("Extension context invalidated"));
                  }
                  return rTarget.sendMessage(...args).catch((err) => {
                    if (err && err.message && err.message.includes("Extension context invalidated")) {
                      return { error: "Extension context invalidated" };
                    }
                    throw err;
                  });
                } catch (e) {
                  return Promise.reject(e);
                }
              };
            }
            return Reflect.get(rTarget, rProp);
          }
        });
      }
      return Reflect.get(target, prop);
    }
  }) : void 0;

  // node_modules/qr-creator/dist/qr-creator.es6.min.js
  var G = null;
  var H = class {
  };
  H.render = function(w, B) {
    G(w, B);
  };
  self.QrCreator = H;
  (function(w) {
    function B(t, c, a, e) {
      var b = {}, h = w(a, c);
      h.u(t);
      h.J();
      e = e || 0;
      var r = h.h(), d = h.h() + 2 * e;
      b.text = t;
      b.level = c;
      b.version = a;
      b.O = d;
      b.a = function(b2, a2) {
        b2 -= e;
        a2 -= e;
        return 0 > b2 || b2 >= r || 0 > a2 || a2 >= r ? false : h.a(b2, a2);
      };
      return b;
    }
    function C(t, c, a, e, b, h, r, d, g2, x) {
      function u(b2, a2, f, c2, d2, r2, g3) {
        b2 ? (t.lineTo(a2 + r2, f + g3), t.arcTo(a2, f, c2, d2, h)) : t.lineTo(a2, f);
      }
      r ? t.moveTo(c + h, a) : t.moveTo(c, a);
      u(d, e, a, e, b, -h, 0);
      u(g2, e, b, c, b, 0, -h);
      u(x, c, b, c, a, h, 0);
      u(r, c, a, e, a, 0, h);
    }
    function z(t, c, a, e, b, h, r, d, g2, x) {
      function u(b2, a2, c2, d2) {
        t.moveTo(b2 + c2, a2);
        t.lineTo(
          b2,
          a2
        );
        t.lineTo(b2, a2 + d2);
        t.arcTo(b2, a2, b2 + c2, a2, h);
      }
      r && u(c, a, h, h);
      d && u(e, a, -h, h);
      g2 && u(e, b, -h, -h);
      x && u(c, b, h, -h);
    }
    function A(t, c) {
      var a = c.fill;
      if ("string" === typeof a) t.fillStyle = a;
      else {
        var e = a.type, b = a.colorStops;
        a = a.position.map((b2) => Math.round(b2 * c.size));
        if ("linear-gradient" === e) var h = t.createLinearGradient.apply(t, a);
        else if ("radial-gradient" === e) h = t.createRadialGradient.apply(t, a);
        else throw Error("Unsupported fill");
        b.forEach(([b2, a2]) => {
          h.addColorStop(b2, a2);
        });
        t.fillStyle = h;
      }
    }
    function y(t, c) {
      a: {
        var a = c.text, e = c.v, b = c.N, h = c.K, r = c.P;
        b = Math.max(1, b || 1);
        for (h = Math.min(40, h || 40); b <= h; b += 1) try {
          var d = B(a, e, b, r);
          break a;
        } catch (J) {
        }
        d = void 0;
      }
      if (!d) return null;
      a = t.getContext("2d");
      c.background && (a.fillStyle = c.background, a.fillRect(c.left, c.top, c.size, c.size));
      e = d.O;
      h = c.size / e;
      a.beginPath();
      for (r = 0; r < e; r += 1) for (b = 0; b < e; b += 1) {
        var g2 = a, x = c.left + b * h, u = c.top + r * h, p = r, q = b, f = d.a, k = x + h, m = u + h, D = p - 1, E = p + 1, n = q - 1, l = q + 1, y2 = Math.floor(Math.min(0.5, Math.max(0, c.R)) * h), v2 = f(p, q), I = f(D, n), w2 = f(D, q);
        D = f(D, l);
        var F = f(p, l);
        l = f(E, l);
        q = f(
          E,
          q
        );
        E = f(E, n);
        p = f(p, n);
        x = Math.round(x);
        u = Math.round(u);
        k = Math.round(k);
        m = Math.round(m);
        v2 ? C(g2, x, u, k, m, y2, !w2 && !p, !w2 && !F, !q && !F, !q && !p) : z(g2, x, u, k, m, y2, w2 && p && I, w2 && F && D, q && F && l, q && p && E);
      }
      A(a, c);
      a.fill();
      return t;
    }
    var v = { minVersion: 1, maxVersion: 40, ecLevel: "L", left: 0, top: 0, size: 200, fill: "#000", background: null, text: "no text", radius: 0.5, quiet: 0 };
    G = function(t, c) {
      var a = {};
      Object.assign(a, v, t);
      a.N = a.minVersion;
      a.K = a.maxVersion;
      a.v = a.ecLevel;
      a.left = a.left;
      a.top = a.top;
      a.size = a.size;
      a.fill = a.fill;
      a.background = a.background;
      a.text = a.text;
      a.R = a.radius;
      a.P = a.quiet;
      if (c instanceof HTMLCanvasElement) {
        if (c.width !== a.size || c.height !== a.size) c.width = a.size, c.height = a.size;
        c.getContext("2d").clearRect(0, 0, c.width, c.height);
        y(c, a);
      } else t = document.createElement("canvas"), t.width = a.size, t.height = a.size, a = y(t, a), c.appendChild(a);
    };
  })(function() {
    function w(c) {
      var a = C.s(c);
      return { S: function() {
        return 4;
      }, b: function() {
        return a.length;
      }, write: function(c2) {
        for (var b = 0; b < a.length; b += 1) c2.put(a[b], 8);
      } };
    }
    function B() {
      var c = [], a = 0, e = {
        B: function() {
          return c;
        },
        c: function(b) {
          return 1 == (c[Math.floor(b / 8)] >>> 7 - b % 8 & 1);
        },
        put: function(b, h) {
          for (var a2 = 0; a2 < h; a2 += 1) e.m(1 == (b >>> h - a2 - 1 & 1));
        },
        f: function() {
          return a;
        },
        m: function(b) {
          var h = Math.floor(a / 8);
          c.length <= h && c.push(0);
          b && (c[h] |= 128 >>> a % 8);
          a += 1;
        }
      };
      return e;
    }
    function C(c, a) {
      function e(b2, h2) {
        for (var a2 = -1; 7 >= a2; a2 += 1) if (!(-1 >= b2 + a2 || d <= b2 + a2)) for (var c2 = -1; 7 >= c2; c2 += 1) -1 >= h2 + c2 || d <= h2 + c2 || (r[b2 + a2][h2 + c2] = 0 <= a2 && 6 >= a2 && (0 == c2 || 6 == c2) || 0 <= c2 && 6 >= c2 && (0 == a2 || 6 == a2) || 2 <= a2 && 4 >= a2 && 2 <= c2 && 4 >= c2 ? true : false);
      }
      function b(b2, a2) {
        for (var f = d = 4 * c + 17, k = Array(f), m = 0; m < f; m += 1) {
          k[m] = Array(f);
          for (var p = 0; p < f; p += 1) k[m][p] = null;
        }
        r = k;
        e(0, 0);
        e(d - 7, 0);
        e(0, d - 7);
        f = y.G(c);
        for (k = 0; k < f.length; k += 1) for (m = 0; m < f.length; m += 1) {
          p = f[k];
          var q = f[m];
          if (null == r[p][q]) for (var n = -2; 2 >= n; n += 1) for (var l = -2; 2 >= l; l += 1) r[p + n][q + l] = -2 == n || 2 == n || -2 == l || 2 == l || 0 == n && 0 == l;
        }
        for (f = 8; f < d - 8; f += 1) null == r[f][6] && (r[f][6] = 0 == f % 2);
        for (f = 8; f < d - 8; f += 1) null == r[6][f] && (r[6][f] = 0 == f % 2);
        f = y.w(h << 3 | a2);
        for (k = 0; 15 > k; k += 1) m = !b2 && 1 == (f >> k & 1), r[6 > k ? k : 8 > k ? k + 1 : d - 15 + k][8] = m, r[8][8 > k ? d - k - 1 : 9 > k ? 15 - k : 14 - k] = m;
        r[d - 8][8] = !b2;
        if (7 <= c) {
          f = y.A(c);
          for (k = 0; 18 > k; k += 1) m = !b2 && 1 == (f >> k & 1), r[Math.floor(k / 3)][k % 3 + d - 8 - 3] = m;
          for (k = 0; 18 > k; k += 1) m = !b2 && 1 == (f >> k & 1), r[k % 3 + d - 8 - 3][Math.floor(k / 3)] = m;
        }
        if (null == g2) {
          b2 = t.I(c, h);
          f = B();
          for (k = 0; k < x.length; k += 1) m = x[k], f.put(4, 4), f.put(m.b(), y.f(4, c)), m.write(f);
          for (k = m = 0; k < b2.length; k += 1) m += b2[k].j;
          if (f.f() > 8 * m) throw Error("code length overflow. (" + f.f() + ">" + 8 * m + ")");
          for (f.f() + 4 <= 8 * m && f.put(0, 4); 0 != f.f() % 8; ) f.m(false);
          for (; !(f.f() >= 8 * m); ) {
            f.put(236, 8);
            if (f.f() >= 8 * m) break;
            f.put(17, 8);
          }
          var u2 = 0;
          m = k = 0;
          p = Array(b2.length);
          q = Array(b2.length);
          for (n = 0; n < b2.length; n += 1) {
            var v2 = b2[n].j, w2 = b2[n].o - v2;
            k = Math.max(k, v2);
            m = Math.max(m, w2);
            p[n] = Array(v2);
            for (l = 0; l < p[n].length; l += 1) p[n][l] = 255 & f.B()[l + u2];
            u2 += v2;
            l = y.C(w2);
            v2 = z(p[n], l.b() - 1).l(l);
            q[n] = Array(l.b() - 1);
            for (l = 0; l < q[n].length; l += 1) w2 = l + v2.b() - q[n].length, q[n][l] = 0 <= w2 ? v2.c(w2) : 0;
          }
          for (l = f = 0; l < b2.length; l += 1) f += b2[l].o;
          f = Array(f);
          for (l = u2 = 0; l < k; l += 1) for (n = 0; n < b2.length; n += 1) l < p[n].length && (f[u2] = p[n][l], u2 += 1);
          for (l = 0; l < m; l += 1) for (n = 0; n < b2.length; n += 1) l < q[n].length && (f[u2] = q[n][l], u2 += 1);
          g2 = f;
        }
        b2 = g2;
        f = -1;
        k = d - 1;
        m = 7;
        p = 0;
        a2 = y.F(a2);
        for (q = d - 1; 0 < q; q -= 2) for (6 == q && --q; ; ) {
          for (n = 0; 2 > n; n += 1) null == r[k][q - n] && (l = false, p < b2.length && (l = 1 == (b2[p] >>> m & 1)), a2(k, q - n) && (l = !l), r[k][q - n] = l, --m, -1 == m && (p += 1, m = 7));
          k += f;
          if (0 > k || d <= k) {
            k -= f;
            f = -f;
            break;
          }
        }
      }
      var h = A[a], r = null, d = 0, g2 = null, x = [], u = { u: function(b2) {
        b2 = w(b2);
        x.push(b2);
        g2 = null;
      }, a: function(b2, a2) {
        if (0 > b2 || d <= b2 || 0 > a2 || d <= a2) throw Error(b2 + "," + a2);
        return r[b2][a2];
      }, h: function() {
        return d;
      }, J: function() {
        for (var a2 = 0, h2 = 0, c2 = 0; 8 > c2; c2 += 1) {
          b(true, c2);
          var d2 = y.D(u);
          if (0 == c2 || a2 > d2) a2 = d2, h2 = c2;
        }
        b(false, h2);
      } };
      return u;
    }
    function z(c, a) {
      if ("undefined" == typeof c.length) throw Error(c.length + "/" + a);
      var e = function() {
        for (var b2 = 0; b2 < c.length && 0 == c[b2]; ) b2 += 1;
        for (var r = Array(c.length - b2 + a), d = 0; d < c.length - b2; d += 1) r[d] = c[d + b2];
        return r;
      }(), b = { c: function(b2) {
        return e[b2];
      }, b: function() {
        return e.length;
      }, multiply: function(a2) {
        for (var h = Array(b.b() + a2.b() - 1), c2 = 0; c2 < b.b(); c2 += 1) for (var g2 = 0; g2 < a2.b(); g2 += 1) h[c2 + g2] ^= v.i(v.g(b.c(c2)) + v.g(a2.c(g2)));
        return z(h, 0);
      }, l: function(a2) {
        if (0 > b.b() - a2.b()) return b;
        for (var c2 = v.g(b.c(0)) - v.g(a2.c(0)), h = Array(b.b()), g2 = 0; g2 < b.b(); g2 += 1) h[g2] = b.c(g2);
        for (g2 = 0; g2 < a2.b(); g2 += 1) h[g2] ^= v.i(v.g(a2.c(g2)) + c2);
        return z(h, 0).l(a2);
      } };
      return b;
    }
    C.s = function(c) {
      for (var a = [], e = 0; e < c.length; e++) {
        var b = c.charCodeAt(e);
        128 > b ? a.push(b) : 2048 > b ? a.push(192 | b >> 6, 128 | b & 63) : 55296 > b || 57344 <= b ? a.push(224 | b >> 12, 128 | b >> 6 & 63, 128 | b & 63) : (e++, b = 65536 + ((b & 1023) << 10 | c.charCodeAt(e) & 1023), a.push(240 | b >> 18, 128 | b >> 12 & 63, 128 | b >> 6 & 63, 128 | b & 63));
      }
      return a;
    };
    var A = { L: 1, M: 0, Q: 3, H: 2 }, y = /* @__PURE__ */ function() {
      function c(b) {
        for (var a2 = 0; 0 != b; ) a2 += 1, b >>>= 1;
        return a2;
      }
      var a = [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
      ], e = { w: function(b) {
        for (var a2 = b << 10; 0 <= c(a2) - c(1335); ) a2 ^= 1335 << c(a2) - c(1335);
        return (b << 10 | a2) ^ 21522;
      }, A: function(b) {
        for (var a2 = b << 12; 0 <= c(a2) - c(7973); ) a2 ^= 7973 << c(a2) - c(7973);
        return b << 12 | a2;
      }, G: function(b) {
        return a[b - 1];
      }, F: function(b) {
        switch (b) {
          case 0:
            return function(b2, a2) {
              return 0 == (b2 + a2) % 2;
            };
          case 1:
            return function(b2) {
              return 0 == b2 % 2;
            };
          case 2:
            return function(b2, a2) {
              return 0 == a2 % 3;
            };
          case 3:
            return function(b2, a2) {
              return 0 == (b2 + a2) % 3;
            };
          case 4:
            return function(b2, a2) {
              return 0 == (Math.floor(b2 / 2) + Math.floor(a2 / 3)) % 2;
            };
          case 5:
            return function(b2, a2) {
              return 0 == b2 * a2 % 2 + b2 * a2 % 3;
            };
          case 6:
            return function(b2, a2) {
              return 0 == (b2 * a2 % 2 + b2 * a2 % 3) % 2;
            };
          case 7:
            return function(b2, a2) {
              return 0 == (b2 * a2 % 3 + (b2 + a2) % 2) % 2;
            };
          default:
            throw Error("bad maskPattern:" + b);
        }
      }, C: function(b) {
        for (var a2 = z([1], 0), c2 = 0; c2 < b; c2 += 1) a2 = a2.multiply(z([1, v.i(c2)], 0));
        return a2;
      }, f: function(b, a2) {
        if (4 != b || 1 > a2 || 40 < a2) throw Error("mode: " + b + "; type: " + a2);
        return 10 > a2 ? 8 : 16;
      }, D: function(b) {
        for (var a2 = b.h(), c2 = 0, d = 0; d < a2; d += 1) for (var g2 = 0; g2 < a2; g2 += 1) {
          for (var e2 = 0, t2 = b.a(d, g2), p = -1; 1 >= p; p += 1) if (!(0 > d + p || a2 <= d + p)) for (var q = -1; 1 >= q; q += 1) 0 > g2 + q || a2 <= g2 + q || (0 != p || 0 != q) && t2 == b.a(d + p, g2 + q) && (e2 += 1);
          5 < e2 && (c2 += 3 + e2 - 5);
        }
        for (d = 0; d < a2 - 1; d += 1) for (g2 = 0; g2 < a2 - 1; g2 += 1) if (e2 = 0, b.a(d, g2) && (e2 += 1), b.a(d + 1, g2) && (e2 += 1), b.a(d, g2 + 1) && (e2 += 1), b.a(d + 1, g2 + 1) && (e2 += 1), 0 == e2 || 4 == e2) c2 += 3;
        for (d = 0; d < a2; d += 1) for (g2 = 0; g2 < a2 - 6; g2 += 1) b.a(d, g2) && !b.a(d, g2 + 1) && b.a(d, g2 + 2) && b.a(d, g2 + 3) && b.a(d, g2 + 4) && !b.a(d, g2 + 5) && b.a(d, g2 + 6) && (c2 += 40);
        for (g2 = 0; g2 < a2; g2 += 1) for (d = 0; d < a2 - 6; d += 1) b.a(d, g2) && !b.a(d + 1, g2) && b.a(d + 2, g2) && b.a(d + 3, g2) && b.a(d + 4, g2) && !b.a(d + 5, g2) && b.a(d + 6, g2) && (c2 += 40);
        for (g2 = e2 = 0; g2 < a2; g2 += 1) for (d = 0; d < a2; d += 1) b.a(d, g2) && (e2 += 1);
        return c2 += Math.abs(100 * e2 / a2 / a2 - 50) / 5 * 10;
      } };
      return e;
    }(), v = function() {
      for (var c = Array(256), a = Array(256), e = 0; 8 > e; e += 1) c[e] = 1 << e;
      for (e = 8; 256 > e; e += 1) c[e] = c[e - 4] ^ c[e - 5] ^ c[e - 6] ^ c[e - 8];
      for (e = 0; 255 > e; e += 1) a[c[e]] = e;
      return { g: function(b) {
        if (1 > b) throw Error("glog(" + b + ")");
        return a[b];
      }, i: function(b) {
        for (; 0 > b; ) b += 255;
        for (; 256 <= b; ) b -= 255;
        return c[b];
      } };
    }(), t = /* @__PURE__ */ function() {
      function c(b, c2) {
        switch (c2) {
          case A.L:
            return a[4 * (b - 1)];
          case A.M:
            return a[4 * (b - 1) + 1];
          case A.Q:
            return a[4 * (b - 1) + 2];
          case A.H:
            return a[4 * (b - 1) + 3];
        }
      }
      var a = [
        [1, 26, 19],
        [1, 26, 16],
        [1, 26, 13],
        [1, 26, 9],
        [1, 44, 34],
        [1, 44, 28],
        [1, 44, 22],
        [1, 44, 16],
        [1, 70, 55],
        [1, 70, 44],
        [2, 35, 17],
        [2, 35, 13],
        [1, 100, 80],
        [2, 50, 32],
        [2, 50, 24],
        [4, 25, 9],
        [1, 134, 108],
        [2, 67, 43],
        [2, 33, 15, 2, 34, 16],
        [2, 33, 11, 2, 34, 12],
        [2, 86, 68],
        [4, 43, 27],
        [4, 43, 19],
        [4, 43, 15],
        [2, 98, 78],
        [4, 49, 31],
        [2, 32, 14, 4, 33, 15],
        [4, 39, 13, 1, 40, 14],
        [2, 121, 97],
        [2, 60, 38, 2, 61, 39],
        [4, 40, 18, 2, 41, 19],
        [4, 40, 14, 2, 41, 15],
        [2, 146, 116],
        [
          3,
          58,
          36,
          2,
          59,
          37
        ],
        [4, 36, 16, 4, 37, 17],
        [4, 36, 12, 4, 37, 13],
        [2, 86, 68, 2, 87, 69],
        [4, 69, 43, 1, 70, 44],
        [6, 43, 19, 2, 44, 20],
        [6, 43, 15, 2, 44, 16],
        [4, 101, 81],
        [1, 80, 50, 4, 81, 51],
        [4, 50, 22, 4, 51, 23],
        [3, 36, 12, 8, 37, 13],
        [2, 116, 92, 2, 117, 93],
        [6, 58, 36, 2, 59, 37],
        [4, 46, 20, 6, 47, 21],
        [7, 42, 14, 4, 43, 15],
        [4, 133, 107],
        [8, 59, 37, 1, 60, 38],
        [8, 44, 20, 4, 45, 21],
        [12, 33, 11, 4, 34, 12],
        [3, 145, 115, 1, 146, 116],
        [4, 64, 40, 5, 65, 41],
        [11, 36, 16, 5, 37, 17],
        [11, 36, 12, 5, 37, 13],
        [5, 109, 87, 1, 110, 88],
        [5, 65, 41, 5, 66, 42],
        [5, 54, 24, 7, 55, 25],
        [11, 36, 12, 7, 37, 13],
        [5, 122, 98, 1, 123, 99],
        [
          7,
          73,
          45,
          3,
          74,
          46
        ],
        [15, 43, 19, 2, 44, 20],
        [3, 45, 15, 13, 46, 16],
        [1, 135, 107, 5, 136, 108],
        [10, 74, 46, 1, 75, 47],
        [1, 50, 22, 15, 51, 23],
        [2, 42, 14, 17, 43, 15],
        [5, 150, 120, 1, 151, 121],
        [9, 69, 43, 4, 70, 44],
        [17, 50, 22, 1, 51, 23],
        [2, 42, 14, 19, 43, 15],
        [3, 141, 113, 4, 142, 114],
        [3, 70, 44, 11, 71, 45],
        [17, 47, 21, 4, 48, 22],
        [9, 39, 13, 16, 40, 14],
        [3, 135, 107, 5, 136, 108],
        [3, 67, 41, 13, 68, 42],
        [15, 54, 24, 5, 55, 25],
        [15, 43, 15, 10, 44, 16],
        [4, 144, 116, 4, 145, 117],
        [17, 68, 42],
        [17, 50, 22, 6, 51, 23],
        [19, 46, 16, 6, 47, 17],
        [2, 139, 111, 7, 140, 112],
        [17, 74, 46],
        [7, 54, 24, 16, 55, 25],
        [34, 37, 13],
        [
          4,
          151,
          121,
          5,
          152,
          122
        ],
        [4, 75, 47, 14, 76, 48],
        [11, 54, 24, 14, 55, 25],
        [16, 45, 15, 14, 46, 16],
        [6, 147, 117, 4, 148, 118],
        [6, 73, 45, 14, 74, 46],
        [11, 54, 24, 16, 55, 25],
        [30, 46, 16, 2, 47, 17],
        [8, 132, 106, 4, 133, 107],
        [8, 75, 47, 13, 76, 48],
        [7, 54, 24, 22, 55, 25],
        [22, 45, 15, 13, 46, 16],
        [10, 142, 114, 2, 143, 115],
        [19, 74, 46, 4, 75, 47],
        [28, 50, 22, 6, 51, 23],
        [33, 46, 16, 4, 47, 17],
        [8, 152, 122, 4, 153, 123],
        [22, 73, 45, 3, 74, 46],
        [8, 53, 23, 26, 54, 24],
        [12, 45, 15, 28, 46, 16],
        [3, 147, 117, 10, 148, 118],
        [3, 73, 45, 23, 74, 46],
        [4, 54, 24, 31, 55, 25],
        [11, 45, 15, 31, 46, 16],
        [7, 146, 116, 7, 147, 117],
        [21, 73, 45, 7, 74, 46],
        [1, 53, 23, 37, 54, 24],
        [19, 45, 15, 26, 46, 16],
        [5, 145, 115, 10, 146, 116],
        [19, 75, 47, 10, 76, 48],
        [15, 54, 24, 25, 55, 25],
        [23, 45, 15, 25, 46, 16],
        [13, 145, 115, 3, 146, 116],
        [2, 74, 46, 29, 75, 47],
        [42, 54, 24, 1, 55, 25],
        [23, 45, 15, 28, 46, 16],
        [17, 145, 115],
        [10, 74, 46, 23, 75, 47],
        [10, 54, 24, 35, 55, 25],
        [19, 45, 15, 35, 46, 16],
        [17, 145, 115, 1, 146, 116],
        [14, 74, 46, 21, 75, 47],
        [29, 54, 24, 19, 55, 25],
        [11, 45, 15, 46, 46, 16],
        [13, 145, 115, 6, 146, 116],
        [14, 74, 46, 23, 75, 47],
        [44, 54, 24, 7, 55, 25],
        [59, 46, 16, 1, 47, 17],
        [12, 151, 121, 7, 152, 122],
        [12, 75, 47, 26, 76, 48],
        [39, 54, 24, 14, 55, 25],
        [22, 45, 15, 41, 46, 16],
        [6, 151, 121, 14, 152, 122],
        [6, 75, 47, 34, 76, 48],
        [46, 54, 24, 10, 55, 25],
        [2, 45, 15, 64, 46, 16],
        [17, 152, 122, 4, 153, 123],
        [29, 74, 46, 14, 75, 47],
        [49, 54, 24, 10, 55, 25],
        [24, 45, 15, 46, 46, 16],
        [4, 152, 122, 18, 153, 123],
        [13, 74, 46, 32, 75, 47],
        [48, 54, 24, 14, 55, 25],
        [42, 45, 15, 32, 46, 16],
        [20, 147, 117, 4, 148, 118],
        [40, 75, 47, 7, 76, 48],
        [43, 54, 24, 22, 55, 25],
        [10, 45, 15, 67, 46, 16],
        [19, 148, 118, 6, 149, 119],
        [18, 75, 47, 31, 76, 48],
        [34, 54, 24, 34, 55, 25],
        [20, 45, 15, 61, 46, 16]
      ], e = { I: function(b, a2) {
        var e2 = c(b, a2);
        if ("undefined" == typeof e2) throw Error("bad rs block @ typeNumber:" + b + "/errorCorrectLevel:" + a2);
        b = e2.length / 3;
        a2 = [];
        for (var d = 0; d < b; d += 1) for (var g2 = e2[3 * d], h = e2[3 * d + 1], t2 = e2[3 * d + 2], p = 0; p < g2; p += 1) {
          var q = t2, f = {};
          f.o = h;
          f.j = q;
          a2.push(f);
        }
        return a2;
      } };
      return e;
    }();
    return C;
  }());
  var qr_creator_es6_min_default = QrCreator;

  // src/content/panel-template.ts
  function buildPanelTemplate(version) {
    return `
    <style>
      :host {
        color-scheme: dark;
        --bg-glass: rgba(18, 18, 22, 0.88);
        --border-color: rgba(255, 255, 255, 0.08);
        --text-primary: #f3f4f6;
        --text-secondary: #9ca3af;
        --accent-color: #10b981;
        --accent-glow: rgba(16, 185, 129, 0.2);
        --accent-border: #059669;
        --theme-text-color: #34d399;
        --bg-panel-solid: #121216;
        --bg-card: rgba(255, 255, 255, 0.02);
        --btn-bg: rgba(255, 255, 255, 0.04);
        --btn-hover: rgba(255, 255, 255, 0.1);
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      :host(.dragging), :host(.dragging) .box {
        transition: none !important;
      }
      
      .theme-emerald {
        --accent-color: #10b981;
        --accent-glow: rgba(16, 185, 129, 0.2);
        --accent-border: #059669;
        --theme-text-color: #34d399;
        --bg-panel-solid: #121216;
      }
      .theme-synthwave {
        --accent-color: #d946ef;
        --accent-glow: rgba(217, 70, 239, 0.2);
        --accent-border: #c026d3;
        --theme-text-color: #f472b6;
        --bg-glass: rgba(20, 16, 32, 0.88);
        --bg-panel-solid: #141020;
      }
      .theme-amber {
        --accent-color: #f59e0b;
        --accent-glow: rgba(245, 158, 11, 0.2);
        --accent-border: #d97706;
        --theme-text-color: #fbbf24;
        --bg-panel-solid: #121216;
      }
      .theme-sapphire {
        --accent-color: #06b6d4;
        --accent-glow: rgba(6, 182, 212, 0.2);
        --accent-border: #0891b2;
        --theme-text-color: #22d3ee;
        --bg-glass: rgba(15, 20, 32, 0.88);
        --bg-panel-solid: #0f1420;
      }

      .box {
        position: relative;
        background: var(--bg-glass);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: var(--text-primary);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
        font-size: 12.5px;
        line-height: 1.6;
        padding: 14px;
        border: 1px solid var(--border-color);
        border-radius: 14px;
        width: 320px;
        height: auto;
        min-width: 240px;
        min-height: 100px;
        max-height: 85vh;
        max-width: 90vw;
        resize: both;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        opacity: .99;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-sizing: border-box;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      }
      /* Desktop minimized state: Text pill */
      @media (min-width: 601px) {
        .box.minimized {
          width: 130px;
          height: 32px;
          min-width: 130px;
          min-height: 32px;
          border-radius: 16px;
          overflow: hidden;
          resize: none;
          padding: 0 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          background: rgba(18, 18, 22, 0.95);
          border-color: var(--accent-color);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          cursor: pointer;
        }
        .box.minimized #drag-handle {
          padding-bottom: 0;
          border-bottom: none;
          margin-bottom: 0;
          justify-content: space-between;
          align-items: center;
          height: 100%;
          width: 100%;
        }
        .box.minimized #min-toggle {
          background: none;
          border: none;
          color: var(--accent-color);
          cursor: pointer;
          font-size: 13px;
          padding: 0 4px;
          margin: 0;
          width: auto;
          height: auto;
          display: inline-block;
          border-radius: 0;
        }
        .box.minimized #min-toggle:hover {
          color: var(--theme-text-color);
          background: none;
        }
      }

      /* Mobile minimized state: Circle icon */
      @media (max-width: 600px) {
        .box.minimized {
          width: 45px;
          height: 45px;
          min-width: 45px;
          min-height: 45px;
          border-radius: 50%;
          overflow: hidden;
          resize: none;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          background: var(--bg-glass);
          border-color: var(--accent-color);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          cursor: pointer;
        }
        .box.minimized #drag-handle {
          padding-bottom: 0;
          border-bottom: none;
          margin-bottom: 0;
          justify-content: center;
          align-items: center;
          height: 100%;
          width: 100%;
        }
        .box.minimized #min-toggle {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border-radius: 50%;
        }
        .box.minimized #min-toggle:hover {
          color: var(--theme-text-color);
          background: rgba(255, 255, 255, 0.05);
        }
        .box.minimized .badge-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          margin: 0;
          width: 8px;
          height: 8px;
          z-index: 10;
        }
        .box:not(.minimized) {
          width: 100% !important;
          height: 100% !important;
          min-width: 0 !important;
          min-height: 0 !important;
          max-width: none !important;
          max-height: none !important;
          resize: none !important;
          border-radius: 14px !important;
        }
      }

      /* Narrow-viewport (phone) layout: cap the expanded panel's height so it never covers the
         whole screen \u2014 the story underneath must stay scrollable and touch-reachable. The panel's
         own scroll containers (.tab-pane / .scrollable-panel) become self-contained so a scroll
         gesture that hits the top/bottom of the panel's content never chains into the page scroll.
         Threshold intentionally matches applyPosition()'s "window.innerWidth <= 600" branch in
         panel.ts exactly \u2014 anything above 600px must stay on the desktop floating/resizable path
         (user-set inline height from localStorage) with zero interference from this block.
         Only max-height is set here, not height: on mobile, applyPosition() already sizes the
         outer host to "min(70dvh, 70vh)" and sets "box.style.height = 100%", so the box fills
         the host with no gap for short content. The earlier "@media (max-width: 600px)" block
         above already applies "height: 100% !important" / "max-height: none !important" to this
         same selector; this block comes later in source order so, at equal specificity, its
         max-height (below) is the one that wins and supplies the real cap \u2014 while the fill
         ("height: 100%") from the earlier block is left standing. Forcing "height: auto" here
         would fight that fill and reopen a gap under short content, so it's deliberately omitted. */
      @media (max-width: 600px) {
        .box:not(.minimized) {
          max-height: 70vh !important;
          max-height: min(70dvh, 70vh) !important;
        }
        /* Mobile top-chrome compaction: the adventure title must never wrap to a second line
           (one-line ellipsis), and the header/stats strips shed their desktop breathing room \u2014
           vertical space is the scarcest resource on a phone. !important where the element
           carries inline template styles. */
        .box:not(.minimized) #st {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          flex: 1;
          font-size: 12.5px;
        }
        .box:not(.minimized) #drag-handle {
          padding-bottom: 5px;
          margin-bottom: 5px;
        }
        /* Adaptive nav (Mobile Rethink Phase A, spec 1): #view-tracker is a flex column, so pure
           CSS order docks the tab bar at the bottom directly above the pinned footer on mobile.
           Desktop keeps document order (tabs on top). No DOM reparenting. */
        .box:not(.minimized) #main-tab-nav {
          order: 98;
          margin-bottom: 0 !important;
          margin-top: 8px;
        }
        .box:not(.minimized) #main-footer {
          order: 99;
          margin-top: 6px !important;
        }
        /* Touch targets: the tiny icon/micro buttons (delete \u2715, edit \u270F, regen \u26A1, Clear, \u2026) are
           14px glyphs with a few px of padding \u2014 far under the ~40px recommended hit area, and a
           mis-tap near a red delete is the expensive kind. Grow their HIT AREA on mobile without
           growing the glyphs. !important beats the inline padding most of them carry. */
        .box:not(.minimized) .btn-icon,
        .box:not(.minimized) .btn-micro,
        .box:not(.minimized) .knows-del,
        .box:not(.minimized) .pref-del,
        .box:not(.minimized) .lc-pairing-del {
          min-width: 36px !important;
          min-height: 36px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        /* Drawer/summary rows (NPC drawers, Knows/Preferences/Memory Bank sections, ALM, config
           groups): denser-than-tappable text rows on a phone \u2014 pad them toward touch height. */
        .box:not(.minimized) summary {
          padding-top: 8px !important;
          padding-bottom: 8px !important;
        }
        /* Mobile editing surfaces: textareas can't be corner-resized on touch, so give every one a
           usable base height up front, and bump input/select rows toward comfortable touch-target
           height. !important because most fields carry inline template styles (font-size:11px,
           min-height:60px, etc.) that would otherwise win. The focused textarea additionally
           auto-grows in keyboard mode (panel.ts growFocusedTextarea). */
        .box:not(.minimized) textarea {
          min-height: 88px !important;
          font-size: 12px !important;
        }
        .box:not(.minimized) input[type="text"],
        .box:not(.minimized) input[type="number"],
        .box:not(.minimized) select {
          min-height: 34px !important;
          font-size: 12px !important;
        }
        /* The banners container (Active Location + "New Noun Detected" suggestion) sits ABOVE the
           scrollable results area with flex-shrink:0 \u2014 a tall suggestion banner otherwise extends
           past the panel's 70dvh cap with its Add Card/Ignore/Link buttons unreachable (user report:
           "the create/ignore/link buttons aren't on my screen"). Bound it and give it its own
           self-contained scroll so every control can always be reached. */
        .box:not(.minimized) #location-banners-container {
          max-height: 45vh;
          max-height: min(45dvh, 45vh);
          overflow-y: auto;
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .tab-pane,
        .scrollable-panel {
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
      }

      /* Rounded translucent scrollbars */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.15);
        border-radius: 8px;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.18);
        border: 2px solid transparent;
        background-clip: padding-box;
        border-radius: 8px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.35);
        border: 2px solid transparent;
        background-clip: padding-box;
      }

      /* Slide down and fade in micro-animations for expanding sections and tabs */
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .box .char-card-body,
      .box .char-section-body,
      .box .history-detail-body,
      .box .tab-pane {
        animation: slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }

      button {
        cursor: pointer;
        margin: 2px 0;
        background: var(--btn-bg);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 5px 12px;
        font-size: 11px;
        font-weight: 500;
        font-family: inherit;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        letter-spacing: 0.01em;
      }
      button:hover {
        background: var(--btn-hover);
        border-color: var(--accent-color);
        box-shadow: 0 0 12px var(--accent-glow);
        transform: translateY(-1px);
      }
      button:active {
        transform: translateY(0);
      }
      /* ---- Reusable button classes ---- */
      /* Gradient CTA \u2014 replaces the old #an / #uc per-ID rules and inline gradient buttons.
         :hover is required to beat the generic button:hover background override. */
      .btn-primary {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-border));
        border: none;
        color: #ffffff;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        box-shadow: 0 4px 12px var(--accent-glow);
      }
      .btn-primary:hover {
        background: linear-gradient(135deg, var(--accent-color), var(--accent-color));
        box-shadow: 0 6px 16px var(--accent-glow);
        color: #ffffff;
        transform: translateY(-1px);
      }

      /* Ghost icon button */
      .btn-icon {
        background: none;
        border: none;
        padding: 2px;
        margin: 0;
        cursor: pointer;
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .btn-icon:hover {
        color: var(--text-primary);
        background: none;
        box-shadow: none;
        transform: none;
        border-color: transparent;
      }

      /* Export / download row button */
      .btn-export {
        justify-content: flex-start;
        background: rgba(16, 185, 129, 0.05);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.2);
        padding: 6px 10px;
        text-align: left;
        width: 100%;
        box-sizing: border-box;
      }

      /* Small CRUD action button + color modifiers */
      .btn-micro {
        margin: 0;
        padding: 2px 6px;
        font-size: 9.5px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        width: auto;
        min-height: unset;
      }
      .btn-micro--green { background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
      .btn-micro--blue  { background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
      .btn-micro--red   { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
      .btn-micro--amber { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }

      /* Cancel / dismiss button */
      .btn-cancel {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 10px;
      }
      
      /* Premium glass-morphic input fields */
      input, select {
        width: 100%;
        box-sizing: border-box;
        margin: 6px 0 10px 0;
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 7px 10px;
        border-radius: 8px;
        outline: none;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: inherit;
        font-size: 11px;
      }
      input:focus, select:focus {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px var(--accent-glow);
        background: rgba(0, 0, 0, 0.4);
      }
      select option {
        background-color: #121216;
        color: var(--text-primary);
      }
      /* Compact inputs for dense UI sections (LC, overlays, Adventures Manager) */
      .input-compact {
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 6px;
        height: auto;
      }
      /* Dark-bg inputs for inline editing contexts */
      .input-dark {
        background: rgba(0, 0, 0, 0.3);
      }
      .location-manager-banner summary::-webkit-details-marker {
        display: none; /* the summary is a styled flex row; the default triangle doubles the affordance */
      }
      /* Back-to-top: floats bottom-right above the toolbar, shown only once the active scroll
         container is meaningfully scrolled (panel.ts). Helps desktop too \u2014 long rosters/memory
         lists scroll far on every form factor. */
      #back-to-top {
        display: none;
        position: absolute;
        right: 14px;
        bottom: 52px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        align-items: center;
        justify-content: center;
        background: var(--bg-glass);
        color: var(--accent-color);
        border: 1px solid var(--border-color);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        z-index: 50;
        padding: 0;
        margin: 0;
      }
      #back-to-top:hover {
        border-color: var(--accent-color);
      }
      /* NPC drawer navigation rows: large tappable buttons whose chevron signals "opens its own
         panel view" (Knows / Preferences / Memory Bank). */
      .npc-section-btn {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
        padding: 10px 12px;
        margin: 0;
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .npc-section-btn:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: var(--accent-color);
      }
      .npc-section-chevron {
        color: var(--text-secondary);
        font-size: 15px;
        line-height: 1;
      }
      /* Home tab: search-result / queue rows + section titles (Mobile Rethink Phase A). */
      .home-result-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 7px 8px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11.5px;
        color: var(--text-primary);
      }
      .home-result-row:hover { background: rgba(255, 255, 255, 0.06); }
      .home-result-sub { color: var(--text-secondary); font-size: 10px; flex-shrink: 0; }
      .home-section-title {
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--theme-text-color);
        margin: 2px 0 4px;
      }
      #clear-active-location:hover {
        background: rgba(239, 68, 68, 0.25) !important;
        border-color: rgba(239, 68, 68, 0.5) !important;
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.4) !important;
        transform: translateY(0) !important;
      }
      input[type="checkbox"] {
        cursor: pointer;
        width: 14px;
        height: 14px;
        accent-color: var(--accent-color);
        margin: 0;
        border-radius: 4px;
        transition: all 0.2s;
      }
      
      textarea {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.03);
        color: var(--text-primary);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 8px 12px;
        outline: none;
        font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 11px;
        line-height: 1.5;
        resize: vertical;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      textarea:focus {
        border-color: var(--accent-color);
        box-shadow: 0 0 0 3px var(--accent-glow);
        background: rgba(0, 0, 0, 0.4);
      }
      
      #open-settings svg {
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s;
      }
      #open-settings:hover svg {
        transform: rotate(45deg);
        color: var(--accent-color);
      }

      /* Premium Header Bar */
      #drag-handle {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        cursor: move;
        user-select: none;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 8px;
      }
      #st {
        font-weight: 800;
        font-size: 13.5px;
        letter-spacing: 0.02em;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #min-toggle {
        background: none;
        border: none;
        color: var(--accent-color);
        cursor: pointer;
        font-size: 13px;
        padding: 0 4px;
        margin: 0;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        text-shadow: none;
      }
      #min-toggle:hover {
        color: var(--theme-text-color);
        box-shadow: none;
        background: none;
        border: none;
      }

      /* Premium Toast Notification */
      #toast {
        display: none;
        position: absolute;
        top: 44px;
        left: 50%;
        transform: translate(-50%, -10px);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 6px 14px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        z-index: 9999;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        opacity: 0;
        pointer-events: none;
        white-space: nowrap;
        letter-spacing: 0.02em;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      /* Backfill button footer styling */
      #bf {
        background: none;
        border: none;
        padding: 4px;
        margin: 0;
        cursor: pointer;
        color: var(--text-secondary);
        font-size: 11px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        text-shadow: none;
        box-shadow: none;
      }
      #bf:hover {
        color: var(--accent-color);
        transform: scale(1.05);
        box-shadow: none;
        background: none;
      }

      /* Tabs layout */
      .tab-btn {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-weight: 500;
        cursor: pointer;
        padding: 4px 8px;
        font-size: 11px;
        border-radius: 6px;
        transition: all 0.2s ease;
      }
      .tab-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary);
        border-color: var(--accent-color);
      }
      .tab-btn.active {
        background: var(--accent-color);
        border-color: var(--accent-border);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 0 10px var(--accent-glow);
      }

      /* Adventures Manager DB Explorer Categories styles */
      details.local-category-details {
        border: 1px solid var(--border-color);
        border-left: 2.5px solid var(--text-secondary);
        border-radius: 6px;
        margin: 4px 0;
        background: rgba(255, 255, 255, 0.01);
        transition: all 0.2s ease;
      }
      details.local-category-details[open] {
        background: rgba(0, 0, 0, 0.1);
        border-color: rgba(255, 255, 255, 0.08);
      }
      details.local-category-details > summary {
        cursor: pointer;
        padding: 6px 10px;
        font-weight: 600;
        font-size: 11px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.03em;
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
      }
      details.local-category-details > summary:hover {
        background: rgba(255, 255, 255, 0.02);
      }
      details.local-category-details > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 9px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 6px;
      }
      details.local-category-details[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* Premium Scrollable Container Constraints */
      .tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        max-height: none;
      }
      .tab-pane {
        flex: 1;
        display: none;
        flex-direction: column;
        min-height: 0;
        overflow-y: auto;
      }
      /* Shared scrollable container \u2014 replaces per-ID rules and duplicated inline styles */
      .scrollable-panel {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
        min-height: 0;
        max-height: none;
        box-sizing: border-box;
      }
      .scrollable-panel--column {
        display: flex;
        flex-direction: column;
      }
      /* Direct children must keep their natural height. Without this, accordion
         children (.box details have overflow:hidden, so their flex min-height
         resolves to 0) shrink to fit the column instead of overflowing it, so
         overflow-y:auto never engages and the content is clipped rather than
         scrolled. */
      .scrollable-panel--column > * {
        flex-shrink: 0;
      }
      
      /* Accordion formatting */
      .box details {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        margin: 6px 0;
        background: rgba(255, 255, 255, 0.01);
        transition: all 0.2s;
        overflow: hidden;
      }
      .box details[open] {
        background: rgba(0, 0, 0, 0.15);
        border-color: rgba(255, 255, 255, 0.1);
      }
      .box summary {
        cursor: pointer;
        padding: 8px 12px;
        font-weight: 600;
        user-select: none;
        outline: none;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: space-between;
        list-style: none; /* Hide standard list-marker in Firefox */
      }
      .box summary::-webkit-details-marker {
        display: none; /* Hide standard list-marker in Chrome/Safari */
      }
      .box summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .box summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 10px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .box details[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* ---- Type-group header rows (Characters, Locations, etc.) ---- */
      .group-header {
        border: 1px solid var(--border-color);
        border-left: 3px solid var(--accent-color);
        border-radius: 8px;
        margin: 6px 0;
        background: rgba(255, 255, 255, 0.02);
        transition: all 0.25s ease;
      }
      .group-header[open] {
        background: rgba(0, 0, 0, 0.12);
        border-color: rgba(255, 255, 255, 0.1);
        border-left-color: var(--accent-color);
      }
      .group-header > summary {
        cursor: pointer;
        padding: 9px 12px;
        font-weight: 700;
        font-size: 12px;
        color: var(--theme-text-color);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
      }
      .group-header > summary:hover {
        background: rgba(255, 255, 255, 0.04);
        box-shadow: inset 0 0 12px var(--accent-glow);
      }
      .group-header > summary::after {
        content: "\u25BE";
        color: var(--accent-color);
        font-size: 10px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .group-header[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* ---- Archive section header ---- */
      .archive-header {
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-left: 3px solid var(--text-secondary);
        border-radius: 8px;
        margin: 10px 0 6px;
        background: rgba(0, 0, 0, 0.08);
        transition: all 0.25s ease;
      }
      .archive-header[open] {
        background: rgba(0, 0, 0, 0.15);
        border-color: rgba(255, 255, 255, 0.08);
        border-left-color: var(--text-secondary);
      }
      .archive-header > summary {
        cursor: pointer;
        padding: 9px 12px;
        font-weight: 600;
        font-size: 12px;
        color: var(--text-secondary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s;
        width: 100%;
        box-sizing: border-box;
      }
      .archive-header > summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .archive-header > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 10px;
        transition: transform 0.2s;
        display: inline-block;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .archive-header[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* ---- Character card rows inside groups: full-width card-styled elements ---- */
      .box .char-card {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        margin: 8px 0;
        background: rgba(255, 255, 255, 0.02);
        overflow: hidden;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .box .char-card[open] {
        background: rgba(20, 20, 24, 0.85);
        border-color: rgba(255, 255, 255, 0.16);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.05);
        margin: 18px 0; /* Clear visual distance from neighboring cards when expanded */
      }
      .box .char-card > summary {
        cursor: pointer;
        padding: 10px 14px;
        font-weight: 600;
        font-size: 13.5px;
        color: var(--text-primary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.2s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .char-card > summary:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      .box .char-card[open] > summary {
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .box .char-card > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 10px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
      }
      .box .char-card[open] > summary::after {
        transform: rotate(-180deg);
        color: var(--accent-color);
      }

      /* Card Content Body Wrapper */
      .box .char-card-body {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Pending Proposal Container */
      .box .pending-proposal-box {
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 8px;
        padding: 12px;
        background: rgba(239, 68, 68, 0.04);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .box .pending-title {
        font-weight: 700;
        color: #fca5a5;
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 2px;
      }
      .box .pending-summary {
        color: #ffb3b3;
        font-size: 12.5px;
      }

      /* Inner expandable section rows (Current Entry, view proposed entry) */
      .box .char-section {
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.01);
        overflow: hidden;
        transition: all 0.2s ease;
        margin: 0;
      }
      .box .char-section[open] {
        background: rgba(0, 0, 0, 0.2);
        border-color: rgba(255, 255, 255, 0.1);
      }
      .box .char-section > summary {
        cursor: pointer;
        padding: 8px 12px;
        font-weight: 600;
        font-size: 11.5px;
        color: var(--accent-color);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .char-section > summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .box .char-section > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 9px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
        opacity: 0.7;
      }
      .box .char-section[open] > summary::after {
        transform: rotate(-180deg);
      }
      .box .char-section-body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* History & Rewrites Styling */
      .box .history-header {
        margin-top: 4px;
        font-size: 11.5px;
        color: var(--text-secondary);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        padding-top: 10px;
      }
      .box .history-list {
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-right: 4px;
      }
      .box .history-item {
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.01);
        overflow: hidden;
        transition: all 0.2s ease;
        margin: 0;
      }
      .box .history-item[open] {
        background: rgba(0, 0, 0, 0.15);
        border-color: rgba(255, 255, 255, 0.08);
      }
      .box .history-item > summary {
        cursor: pointer;
        padding: 6px 12px;
        font-weight: 500;
        font-size: 12px;
        color: var(--text-primary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .history-item > summary:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .box .history-item > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 9px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
        opacity: 0.5;
      }
      .box .history-item[open] > summary::after {
        transform: rotate(-180deg);
      }
      .box .history-detail-body {
        padding: 10px;
        background: rgba(0, 0, 0, 0.15);
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .box .history-meta {
        font-weight: 600;
        font-size: 11px;
        color: var(--accent-color);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        padding-bottom: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* Doubly-nested view entry details inside history detail body */
      .box .view-entry-detail {
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }
      .box .view-entry-detail > summary {
        cursor: pointer;
        padding: 6px 10px;
        font-weight: 500;
        font-size: 11px;
        color: var(--text-secondary);
        user-select: none;
        outline: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.15s ease;
        width: 100%;
        box-sizing: border-box;
      }
      .box .view-entry-detail > summary:hover {
        background: rgba(255, 255, 255, 0.02);
        color: var(--text-primary);
      }
      .box .view-entry-detail > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 8px;
        display: inline-block;
        transition: transform 0.2s ease;
        margin-left: auto;
        opacity: 0.5;
      }
      .box .view-entry-detail[open] > summary::after {
        transform: rotate(-180deg);
      }

      /* Action Buttons */
      .box .action-btn {
        font-size: 10px;
        padding: 4px 10px;
        background: var(--btn-bg, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease;
        display: inline-block;
      }
      .box .action-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      }
      
      /* Fallback nested detail styles for non-grouped contexts (settings, etc.) */
      .box details details {
        border: none;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 0;
        background: none;
        margin: 0;
      }
      .box details details[open] {
        background: rgba(0, 0, 0, 0.06);
      }
      .box details details > summary {
        cursor: pointer;
        padding: 6px 12px;
        font-weight: 500;
        font-size: 10.5px;
        color: var(--accent-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        box-sizing: border-box;
        transition: all 0.15s;
        user-select: none;
        outline: none;
      }
      .box details details > summary:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      .box details details > summary::after {
        content: "\u25BE";
        color: var(--text-secondary);
        font-size: 9px;
        display: inline-block;
        transition: transform 0.2s;
        margin-left: auto;
        flex-shrink: 0;
        padding-left: 8px;
        opacity: 0.6;
      }
      .box details details[open] > summary::after {
        transform: rotate(-180deg);
      }

      .prop {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 8px;
        margin: 8px 0;
        background: rgba(0, 0, 0, 0.15);
      }
      .sum {
        color: var(--text-primary);
        font-weight: 600;
      }
      .tl {
        color: var(--text-secondary);
        font-size: 11px;
      }
      .code-card {
        background: rgba(10, 10, 12, 0.45);
        border: 1px solid var(--border-color);
        border-left: 3px solid var(--accent-color);
        border-radius: 8px;
        padding: 8px 12px;
        margin: 6px 0;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
      }
      .code-card pre {
        white-space: pre-wrap;
        margin: 0;
        font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 11px;
        line-height: 1.5;
        color: var(--text-primary);
        background: none;
        border: none;
        padding: 0;
        overflow-x: auto;
      }
      .code-card-header {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 6px;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 4px;
        color: var(--accent-color);
      }
      .note {
        color: var(--text-secondary);
        font-size: 11px;
        line-height: 1.5;
      }
      label {
        font-weight: 600;
        font-size: 11px;
        color: var(--text-secondary);
        display: block;
        margin-top: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      h4 { margin: 6px 0 2px }
      .spinner { width: 22px; height: 22px; border: 2px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; animation: aid-spin 0.8s linear infinite; display: inline-block; }
      @keyframes aid-spin { to { transform: rotate(360deg); } }

      /* Glassmorphic Overlay / Modal */
      .box .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(10, 10, 14, 0.98);
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        z-index: 20000;
        display: none;
        flex-direction: column;
        padding: 16px;
        box-sizing: border-box;
        overflow-y: auto;
        animation: slideUp 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
      }
      @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .box .overlay-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .box .overlay-title {
        font-weight: 800;
        font-size: 12px;
        color: var(--accent-color);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .box .overlay-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 16px;
        cursor: pointer;
        padding: 4px;
        display: inline-flex;
        align-items: center;
      }
      .box .overlay-close:hover {
        color: var(--text-primary);
        transform: scale(1.1);
      }
      .box .overlay-content {
        font-size: 11.5px;
        line-height: 1.6;
        color: var(--text-primary);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Tab Navigation for Main Panel */
      .main-tab-nav {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 6px;
        gap: 6px;
        margin-top: 8px;
        box-sizing: border-box;
      }
      /* Main panel tab panes (Card Manager / Memory Bank / Living Characters).
         Display (flex/none) is toggled in JS; structural props live here. */
      .main-tab-pane {
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        min-height: 0;
      }

      /* Shared sub-tab nav row (settings tabs + offmeta + manager groups) */
      .sub-tab-nav {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 6px;
        gap: 4px;
        overflow-x: auto;
      }

      /* Shared underline-style sub-tab buttons (offmeta + manager groups).
         Hover resets neutralize the generic button:hover lift/glow. */
      .input-caption {
        flex: 1;
        text-align: center;
        font-size: 10px;
        color: var(--text-secondary);
        margin: 0;
      }
      .subtab-btn {
        flex: 1;
        white-space: nowrap;
        margin: 0;
        padding: 4px 8px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 10.5px;
        font-weight: 500;
        transition: color 0.2s, border-color 0.2s;
      }
      .subtab-btn:hover {
        color: var(--text-primary);
        background: none;
        box-shadow: none;
        transform: none;
        border-color: transparent;
      }
      .subtab-btn.active,
      .subtab-btn.active:hover {
        color: var(--accent-color);
        border-bottom-color: var(--accent-color);
        font-weight: 600;
      }
      .main-tab-btn {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-weight: 600;
        cursor: pointer;
        padding: 5px 8px;
        font-size: 11px;
        border-radius: 8px;
        transition: all 0.2s ease;
      }
      .main-tab-btn:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary);
        border-color: var(--accent-color);
      }
      .main-tab-btn.active {
        background: var(--accent-color);
        border-color: var(--accent-border);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 0 10px var(--accent-glow);
      }

      /* Slowly Pulsing Badge Notification */
      @keyframes slowPulse {
        0% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(217, 70, 239, 0.4); }
        50% { transform: scale(1.08); opacity: 1; box-shadow: 0 0 8px 3px rgba(217, 70, 239, 0.6); }
        100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(217, 70, 239, 0.4); }
      }
      .box .badge-new-memories {
        background: linear-gradient(135deg, #d946ef, #a855f7);
        color: #ffffff;
        font-size: 9.5px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 10px;
        margin-left: 6px;
        display: inline-block;
        vertical-align: middle;
        animation: slowPulse 2s infinite ease-in-out;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      /* Slow flashing/pinging animation for newly added memories */
      @keyframes cardPing {
        0% { border-color: var(--border-color); background: rgba(255, 255, 255, 0.01); box-shadow: 0 0 0px var(--accent-glow); }
        30% { border-color: var(--accent-color); background: var(--accent-glow); box-shadow: 0 0 12px var(--accent-glow); }
        100% { border-color: var(--border-color); background: rgba(255, 255, 255, 0.01); box-shadow: none; }
      }
      .box .memory-card.ping-new {
        animation: cardPing 4s 2 ease-in-out;
      }

      /* Slow pulsing animation for proposals */
      @keyframes slowPulseRed {
        0% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
        50% { transform: scale(1.08); opacity: 1; box-shadow: 0 0 8px 3px rgba(239, 68, 68, 0.6); }
        100% { transform: scale(1); opacity: 0.85; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      }
      .box .badge-new-proposals {
        background: linear-gradient(135deg, #ef4444, #f87171);
        color: #ffffff;
        font-size: 9.5px;
        font-weight: 800;
        padding: 1px 6px;
        border-radius: 10px;
        margin-left: 6px;
        display: inline-block;
        vertical-align: middle;
        animation: slowPulseRed 2s infinite ease-in-out;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      .box .badge-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        background: #ef4444;
        border-radius: 50%;
        margin-left: 5px;
        vertical-align: middle;
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.8);
        animation: slowPulseRed 1.5s infinite ease-in-out;
      }
      .group-header.has-proposals {
        border-color: rgba(239, 68, 68, 0.3);
        border-left-color: #ef4444 !important;
        background: rgba(239, 68, 68, 0.03);
      }
      .group-header.has-proposals > summary {
        color: #fca5a5;
      }
      .group-header.has-proposals > summary::after {
        color: #ef4444;
      }

      /* Memory Bank timeline cards */
      .box .memory-card {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.01);
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: all 0.25s ease;
      }
      .box .memory-card:hover {
        background: rgba(255, 255, 255, 0.03);
        border-color: rgba(255, 255, 255, 0.12);
      }
      .box .memory-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 10px;
        color: var(--text-secondary);
      }
      .box .memory-card-text {
        font-size: 12px;
        line-height: 1.5;
        color: var(--text-primary);
        white-space: pre-wrap;
      }
      .box .memory-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;
        margin-right: 6px;
      }
      .box .memory-status-dot.active {
        background: var(--accent-color);
        box-shadow: 0 0 6px var(--accent-glow);
      }
      .box .memory-status-dot.used {
        background: #d946ef;
        box-shadow: 0 0 6px rgba(217, 70, 239, 0.4);
      }
      .box .memory-status-dot.stored {
        background: var(--text-secondary);
      }
    </style>
    <div class="box theme-emerald">
      <div id="drag-handle">
        <div id="st">AID Story Helper</div>
        <button id="min-toggle">\u2014</button>
      </div>
      <button id="back-to-top" type="button" title="Back to top">\u2191</button>
      <div id="toast">Settings saved</div>
      
      <div id="content-body" style="width:100%; flex:1; display:flex; flex-direction:column; overflow:hidden; min-height:0;">
        <!-- VIEW: TRACKER -->
        <div id="view-tracker" style="display:flex; flex-direction:column; flex:1; overflow:hidden; min-height:0;">
          <!-- Tab Navigation for Main Panel (Home first + default; adaptive bottom bar on mobile) -->
          <div id="main-tab-nav" class="main-tab-nav" style="margin-bottom:8px;">
            <button class="main-tab-btn active" data-tab="main-tab-home" style="flex:1;white-space:nowrap;margin:0;position:relative;">Home<span id="home-pending-badge" style="display:none;"></span></button>
            <button class="main-tab-btn" data-tab="main-tab-tracker" style="flex:1;white-space:nowrap;margin:0;position:relative;">Cards</button>
            <button class="main-tab-btn" data-tab="main-tab-memories" style="flex:1;white-space:nowrap;margin:0;position:relative;">Memory<span id="unread-memories-badge" style="display:none;"></span></button>
            <button class="main-tab-btn" data-tab="main-tab-living-characters" style="flex:1;white-space:nowrap;margin:0;position:relative;">Living</button>
          </div>

          <!-- Main Pane 0: Home (task-first landing \u2014 Mobile Rethink Phase A \xA72) -->
          <div id="main-tab-home" class="main-tab-pane" style="display:flex; flex-direction:column;">
            <div style="position:relative; flex-shrink:0;">
              <input id="home-search" type="text" class="input-compact input-dark" placeholder="Search cards, NPCs\u2026" autocomplete="off" style="width:100%; box-sizing:border-box; padding:7px 10px; font-size:12px;" />
              <div id="home-search-results" style="display:none; flex-direction:column; gap:2px; margin-top:4px; background:rgba(0,0,0,0.35); border:1px solid var(--border-color); border-radius:8px; padding:4px; max-height:220px; overflow-y:auto;"></div>
            </div>
            <div class="scrollable-panel" style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
              <div id="home-status" style="padding:8px 12px;background:rgba(0,0,0,0.25);border-radius:8px;border:1px solid var(--border-color);display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);font-family:SFMono-Regular,Consolas,monospace;flex-shrink:0;">
                <div>Actions: <span id="stat-turn" style="color:var(--accent-color);font-weight:bold;">0</span></div>
                <div>Last Auto-Updated: <span id="stat-last-auto" style="color:var(--accent-color);font-weight:bold;">-</span></div>
              </div>
              <div id="home-pending"></div>
              <div id="home-recent"></div>
            </div>
          </div>

          <!-- Main Pane 1: Card Manager -->
          <div id="main-tab-tracker" class="main-tab-pane" style="display:none;">
            <div id="location-banners-container" style="flex-shrink:0;"></div>
            <div id="setup-helper-container" style="flex-shrink:0; display:none;"></div>
            <div id="view-tracker-scrollable" class="scrollable-panel" style="margin-top:8px;">
              <div id="results"></div>
              <div id="debug-container"></div>
            </div>
          </div>

          <!-- Main Pane 2: Memory Bank (Player timeline / NPC point-of-view banks) -->
          <div id="main-tab-memories" class="main-tab-pane" style="display:none; flex-direction:column;">
            <div class="tab-nav sub-tab-nav">
              <button class="subtab-btn active" data-mbtab="mb-player" style="flex:1;white-space:nowrap;margin:0;">Player</button>
              <button class="subtab-btn" data-mbtab="mb-npc" style="flex:1;white-space:nowrap;margin:0;">NPC</button>
            </div>
            <div id="mb-player" class="mb-pane" style="display:flex; flex-direction:column; flex:1; min-height:0;">
              <div style="display:flex; gap:6px; margin-bottom:8px;">
                <button id="refine-mem" class="btn-primary" style="flex:1; margin:0; padding:6px; font-size:10px;">\u26A1 Regenerate Latest</button>
              </div>
              <div id="aid-memories-scrollable" class="scrollable-panel">
                <div id="aid-memories-list" style="display:flex; flex-direction:column; gap:8px;"></div>
              </div>
            </div>
            <div id="mb-npc" class="mb-pane scrollable-panel scrollable-panel--column" style="display:none; gap:8px;"></div>
          </div>

          <!-- Main Pane 3: Living Characters -->
          <div id="main-tab-living-characters" class="main-tab-pane" style="display:none; gap:8px;">
            <div id="lc-status-banner" style="flex-shrink:0;"></div>
            <div id="lc-scrollable" class="scrollable-panel scrollable-panel--column" style="gap:12px;">
              
              <!-- SECTION: ACTIVE RELATIONSHIP STATUS (LIFE CARDS) -->
              <details class="group-header" open style="border-left-color:var(--accent-color) !important;">
                <summary style="color:var(--accent-color) !important; font-weight:700; font-size:11.5px; cursor:pointer;">
                  <span>\u{1F331} Active Relationships (Life Cards)</span>
                </summary>
                <div style="padding:10px; display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,0.01); border-top:1px solid var(--border-color); box-sizing:border-box; width:100%;">
                  <div id="lc-active-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                  <button id="lc-btn-add-card" class="action-btn" style="background:rgba(192,132,252,0.12); color:#c084fc; border:1px solid rgba(192,132,252,0.3); font-weight:600; padding:6px; border-radius:6px; cursor:pointer; font-size:10px; align-self:flex-start; margin-top:4px; width:auto; min-height:unset;">\u2795 Seed Custom Life Card</button>
                  
                  <!-- Form: Add Custom Life Card (Hidden by default) -->
                  <div id="lc-add-card-form" style="display:none; flex-direction:column; gap:8px; border:1px solid var(--border-color); border-radius:12px; padding:10px; background:rgba(0,0,0,0.2); box-sizing:border-box; width:100%; margin-top:8px;">
                    <div style="font-weight:700; color:var(--text-primary); font-size:11px;">\u{1F331} Seed Custom Life Card</div>
                    
                    <div style="display:flex; flex-direction:column; gap:2px;">
                      <label style="font-weight:600; font-size:10px;">Owner Character (who feels the pressure)</label>
                      <select id="lc-add-owner" class="input-compact input-dark"></select>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; box-sizing:border-box; width:100%;">
                      <div style="display:flex; flex-direction:column; gap:2px;">
                        <label style="font-weight:600; font-size:10px;">Target Name</label>
                        <input type="text" id="lc-add-target" class="input-compact input-dark" placeholder="Bob" />
                      </div>
                      <div style="display:flex; flex-direction:column; gap:2px;">
                        <label style="font-weight:600; font-size:10px;">Pressure</label>
                        <input type="text" id="lc-add-pressure" class="input-compact input-dark" placeholder="jealousy" />
                      </div>
                    </div>

                    <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:2px;">
                      <button id="lc-add-cancel-btn" style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); color:var(--text-primary); font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; width:auto; min-height:unset;">Cancel</button>
                      <button id="lc-add-submit-btn" style="background:rgba(168,85,247,0.15); border:1px solid rgba(168,85,247,0.3); color:#c084fc; font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; font-weight:600; width:auto; min-height:unset;">Create Life Card</button>
                    </div>
                  </div>
                </div>
              </details>

              <!-- SECTION: CONFIGURATION -->
              <details class="group-header" style="--accent-color:#38bdf8; --accent-glow:rgba(56,189,248,0.15); border-left-color:#38bdf8 !important;">
                <summary style="color:#38bdf8 !important; font-weight:700; font-size:11.5px; cursor:pointer;">
                  <span>\u2699\uFE0F Simulation Configuration</span>
                </summary>
                <div style="padding:10px; display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,0.01); border-top:1px solid var(--border-color); font-size:10.5px; color:var(--text-secondary); box-sizing:border-box; width:100%;">
                  
                  <div style="display:flex; flex-direction:column; gap:3px;">
                    <label style="font-weight:600;">NPC Characters Roster (one name per line)</label>
                    <textarea id="lc-config-roster" rows="4" class="input-compact input-dark" style="resize:vertical;" placeholder="Alice&#10;Bob&#10;Charlie"></textarea>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:4px;">
                    <label style="font-weight:600;">Active Pressures Pool (one per line)</label>
                    <textarea id="lc-config-pressures" rows="4" class="input-compact input-dark" style="resize:vertical;" placeholder="friendship&#10;jealousy&#10;rivalry&#10;trust&#10;curiosity"></textarea>
                    <div style="font-size:9px; color:var(--text-secondary); opacity:0.8;">The DEFAULT pool. Used for any pair without its own pairing below.</div>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:4px;">
                    <label style="font-weight:600;">Pairing Pressure Pools</label>
                    <div style="font-size:9px; color:var(--text-secondary); opacity:0.8; margin-bottom:2px;">Give a specific couple their own pressures. Symmetric (either direction) and exclusive \u2014 when both characters are the pair, pressures come ONLY from here, not the default pool.</div>
                    <datalist id="lc-character-names"></datalist>
                    <div id="lc-pairing-pools" style="display:flex; flex-direction:column; gap:6px;"></div>
                    <button id="lc-add-pairing" class="action-btn" style="background:rgba(192,132,252,0.10); color:#c084fc; border:1px solid rgba(192,132,252,0.3); font-weight:600; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:10px; align-self:flex-start; width:auto; min-height:unset; margin-top:2px;">+ Add pairing</button>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Protagonist Name</label>
                      <input id="lc-config-protagonist" type="text" class="input-compact input-dark" placeholder="Frank" />
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Protagonist Involvement</label>
                      <select id="lc-config-involvement" class="input-compact input-dark">
                        <option value="off">Off (NPCs only)</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="always">Always</option>
                      </select>
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Seed Interval (actions between new relationships)</label>
                      <input id="lc-config-interval" type="number" min="1" step="1" placeholder="15" class="input-compact input-dark" />
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Max Active Relationships</label>
                      <select id="lc-config-max" class="input-compact input-dark">
                        <option value="1">1 (Focused)</option>
                        <option value="2">2 (Layered)</option>
                        <option value="3">3 (Busy)</option>
                        <option value="4">4 (Chaos)</option>
                      </select>
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Scene Relevance Gate</label>
                      <select id="lc-config-relevance" class="input-compact input-dark">
                        <option value="off">Off (Seed regardless of who's present)</option>
                        <option value="strict">Strict (Seed only around present characters)</option>
                      </select>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Dormancy Timeout (Actions)</label>
                      <input id="lc-config-dormancy" type="number" min="0" step="1" placeholder="7" class="input-compact input-dark" />
                    </div>
                  </div>

                  <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:4px; box-sizing:border-box; width:100%;">
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Reseed Cooldown (Actions)</label>
                      <input id="lc-config-reseed-cooldown" type="number" min="0" step="1" placeholder="15" class="input-compact input-dark" />
                    </div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                      <label style="font-weight:600;">Activity Lifespan (actions)</label>
                      <input id="lc-config-stale" type="number" min="0" step="1" placeholder="14" class="input-compact input-dark" />
                    </div>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:8px;">
                    <label style="font-weight:600;">Max Lifetime (actions)</label>
                    <input id="lc-config-max-lifetime" type="number" min="0" step="1" placeholder="4" class="input-compact input-dark" />
                    <span style="font-size:9.5px; color:var(--text-secondary);">Hard cap: a pressure is retired after this many actions even while it stays active \u2014 most resolve within 3-5. Catches threads the resolution judge never concludes. 0 disables the cap.</span>
                  </div>

                  <div style="display:flex; flex-direction:column; gap:3px; margin-top:8px;">
                    <label style="font-weight:600;">Continue / Retry Actions</label>
                    <select id="lc-config-continue-mode" class="input-compact input-dark">
                      <option value="defer">Defer directive to next action (recommended)</option>
                      <option value="skip">Don't run on Continue/Retry</option>
                    </select>
                    <span style="font-size:9.5px; color:var(--text-secondary);">Continue/Retry can't carry an injected pressure directive. "Defer" still runs the simulation and surfaces the directive on the next Do/Say/Story; "Skip" pauses the simulation on those actions.</span>
                  </div>

                  <button id="lc-btn-save-config" class="action-btn" style="margin-top:8px; background:linear-gradient(135deg, #0ea5e9, #0284c7); border:none; padding:6px; font-weight:600; border-radius:6px; color:#fff; cursor:pointer; width:100%; min-height:unset;">\u{1F4BE} Save Simulation Config</button>
                </div>
              </details>

              <!-- SECTION: PRESSURES PRESETS LIBRARY -->
              <details class="group-header" style="--accent-color:#10b981; --accent-glow:rgba(16,185,129,0.15); border-left-color:#10b981 !important;">
                <summary style="color:#10b981 !important; font-weight:700; font-size:11.5px; cursor:pointer;">
                  <span>\u{1F3AD} Pressures & Presets Library</span>
                </summary>
                <div style="padding:10px; display:flex; flex-direction:column; gap:10px; background:rgba(255,255,255,0.01); border-top:1px solid var(--border-color); font-size:10.5px; color:var(--text-secondary); box-sizing:border-box; width:100%;">
                  <div>
                    <div style="font-weight:700; margin-bottom:4px; color:var(--text-primary);">Core Pressures</div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px;" id="lc-core-pills-container"></div>
                  </div>

                  <div style="margin-top:4px; width:100%;">
                    <div style="font-weight:700; margin-bottom:6px; color:var(--text-primary);">Preset Modes (Click to Apply)</div>
                    <div style="display:flex; flex-direction:column; gap:8px; box-sizing:border-box; width:100%;" id="lc-modes-container"></div>
                  </div>

                  <div style="margin-top:4px; margin-bottom:4px;">
                    <div style="font-weight:700; margin-bottom:4px; color:var(--text-primary);">Wildcard Spark Injections</div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px;" id="lc-wild-pills-container"></div>
                  </div>
                </div>
              </details>

            </div>
          </div>

          <!-- Pinned Main Footer -->
          <div id="main-footer" style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-color);box-sizing:border-box;">
            <div style="display:flex;gap:12px;align-items:center;">
              <button id="open-settings" style="background:none;border:none;padding:4px;margin:0;cursor:pointer;color:var(--text-secondary);display:inline-flex;align-items:center;" title="Settings">
                <svg style="width:16px;height:16px;fill:currentColor;" viewBox="0 0 24 24">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.13,5.91,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.67,9.34,2.85,9.48l2.03,1.58C4.83,11.36,4.81,11.69,4.81,12c0,0.31,0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
                </svg>
              </button>
              <button id="bf" title="Backfill Scenario History">\u2913 Backfill</button>
            </div>
            
            <button id="create-card-trigger" style="background:var(--accent-color);color:#fff;border:none;border-radius:4px;padding:3.5px 8px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 1px 3px rgba(0,0,0,0.2);" title="Create Story Card">
              <span>+ Add Card</span>
            </button>

            <div style="display:flex;gap:6px;align-items:center;">
              <div style="font-size:10px;color:var(--text-secondary);font-family:system-ui;">v${version}</div>
              <button id="info-help" type="button" class="btn-icon" title="About & How it works">
                <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <!-- VIEW: SETTINGS -->
        <div id="view-settings" style="display:none;flex-direction:column;gap:10px;margin-top:8px;flex:1;overflow:hidden;min-height:0;">
          <!-- Tab Navigation -->
          <div class="tab-nav sub-tab-nav">
            <button class="tab-btn active" data-tab="tab-gen" style="flex:1;white-space:nowrap;margin:0;">General</button>
            <button class="tab-btn" data-tab="tab-prov" style="flex:1;white-space:nowrap;margin:0;">AI Provider</button>
            <button class="tab-btn" data-tab="tab-memoraid" style="flex:1;white-space:nowrap;margin:0;">MemorAID</button>
            <button class="tab-btn" data-tab="tab-living-characters" style="flex:1;white-space:nowrap;margin:0;">Living Characters</button>
            <button class="tab-btn" data-tab="tab-prompts" style="flex:1;white-space:nowrap;margin:0;">Prompts</button>
            <button class="tab-btn" data-tab="tab-offmeta" style="flex:1;white-space:nowrap;margin:0;">OffMeta's AIN</button>
            <button class="tab-btn" data-tab="tab-manager" style="flex:1;white-space:nowrap;margin:0;">Adventures Manager</button>
            <button class="tab-btn" data-tab="tab-debug" style="flex:1;white-space:nowrap;margin:0;">Debug</button>
          </div>
          
          <!-- Tab Panes -->
          <div class="tab-content">
            <!-- Pane: General Settings -->
            <div id="tab-gen" class="tab-pane" style="display:block;">
              <label>Theme</label>
              <select id="theme" style="margin:4px 0 8px 0;">
                <option value="emerald">Modern Emerald</option>
                <option value="synthwave">Synthwave Purple</option>
                <option value="amber">Cyber Amber</option>
                <option value="sapphire">Plasma Sapphire</option>
              </select>
              
              <label>Protagonist Name</label>
              <input id="prot" type="text" placeholder="e.g. Smoke" style="margin:4px 0 8px 0;" />
              
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="auto-regen-memories" type="checkbox" style="width:auto;margin:0;" />
                  Automatically regen latest Memory Bank entry?
                </label>
              </div>
              
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Action Lookback Window</label>
                <button id="info-action-lookback" type="button" class="btn-icon" title="About Action Lookback Window">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="win" type="number" min="1" placeholder="20" style="margin:4px 0 8px 0;" />

              <!-- Dummy setting strictly for visual screenshot matching with public version -->
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Character Card Character Limit</label>
              </div>
              <input id="char-card-limit" type="number" min="100" max="2000" placeholder="600" style="margin:4px 0 8px 0;" />

              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:4px 0 2px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="enable-automatic-updates" type="checkbox" style="width:auto;margin:0;" />
                Auto-Update Character Cards
              </label>
              <div class="note" style="margin:0 0 10px 22px;">When on, the extension proposes Story Card updates on its own as characters leave a scene or stay active. Off by default \u2014 "Generate Core Character" always works manually.</div>

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Active Location Sync Mode</label>
              </div>
              <select id="location-mode" style="margin:4px 0 8px 0;">
                <option value="optionA">Option A: Direct Plot Essentials Tagging</option>
                <option value="optionB">Option B: Active Location Anchor Card</option>
              </select>

              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:10px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="enable-proper-noun-detection" type="checkbox" style="width:auto;margin:0;" checked />
                Auto Proper Noun Detection?
              </label>
              
              <button id="grant-permissions" type="button" class="btn" style="margin-top:12px;background:var(--accent-color);color:#fff;width:100%;font-weight:600;font-size:11px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:6px;border:none;cursor:pointer;">
                <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
                Grant AI Dungeon Permissions
              </button>
            </div>

            <!-- Pane: MemorAID Settings -->
            <div id="tab-memoraid" class="tab-pane" style="display:none; flex-direction:column; gap:8px;">
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="enable-memoraid" type="checkbox" style="width:auto;margin:0;" />
                  Enable MemorAID Thought Tracking?
                </label>
              </div>
              <div class="note" style="margin:0 0 8px;">Add the characters to track in the Card Manager \u2192 \u{1F9E0} MemorAID section (per adventure).</div>
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="use-memories" type="checkbox" style="width:auto;margin:0;" />
                  Use Memories in Plot Essentials?
                </label>
                <button id="info-memories" type="button" class="btn-icon" title="How Memories work">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>

              <!-- Dummy setting strictly for visual screenshot matching with public version -->
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Action Lookback Window</label>
                <button id="info-memoraid-lookback" type="button" class="btn-icon" title="About MemorAID Action Lookback Window">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-win" type="number" min="1" placeholder="8" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Thought Lookback (previous thoughts)</label>
                <button id="info-memoraid-thought" type="button" class="btn-icon" title="About MemorAID Thought Lookback">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-thought-win" type="number" min="1" placeholder="1" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Completion Temperature</label>
                <span id="completion-temp-val" style="opacity:0.8;font-variant-numeric:tabular-nums;min-width:2.2em;text-align:right;">0.7</span>
              </div>
              <input id="completion-temp" type="range" min="0" max="1" step="0.05" value="0.7" style="margin:4px 0 8px 0;width:100%;" />
              <div style="font-size:11px;opacity:0.7;margin:-4px 0 8px 0;">Sampling temperature for all AI generation (thoughts, memories, distillation). Lower = more consistent, higher = more varied. Applies to every provider.</div>

              <!-- Dummy setting strictly for visual screenshot matching with public version -->
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Thought Card Character Limit</label>
              </div>
              <input id="thought-card-limit" type="number" min="100" max="4000" placeholder="2000" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">MemorAID Scene Presence Lookback</label>
                <button id="info-memoraid-presence" type="button" class="btn-icon" title="About MemorAID Scene Presence Lookback">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="memoraid-presence-win" type="number" min="1" placeholder="5" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Action Intercept Timeout (Seconds)</label>
                <button id="info-intercept-timeout" type="button" class="btn-icon" title="About Action Intercept Timeout">
                  <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                  </svg>
                </button>
              </div>
              <input id="intercept-timeout" type="number" min="1" placeholder="4" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:12px 0 4px 0;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="enable-crystallized" type="checkbox" style="width:auto;margin:0;" />
                  Enable Crystallized Memory (Long-Term)?
                </label>
              </div>
              <div class="note" style="margin:0 0 8px;">Distills short-term thoughts into decaying episodic snapshots and permanent facts.</div>

              <div class="note" style="margin:8px 0 4px;font-weight:bold;color:var(--text-secondary);">Distillation layers \u2014 produced together in ONE LLM call per NPC per window; turn a layer off to drop it from the call:</div>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-knows-enabled" type="checkbox" style="width:auto;margin:0;" /> Knows (permanent facts)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-nodes-enabled" type="checkbox" style="width:auto;margin:0;" /> Vivid Memories (decaying snapshots)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-outlook-enabled" type="checkbox" style="width:auto;margin:0;" /> Outlook (settled beliefs)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 3px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-preferences-enabled" type="checkbox" style="width:auto;margin:0;" /> Preferences (personal texture)
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0 0 8px 8px;font-weight:normal;text-transform:none;letter-spacing:normal;">
                <input id="crystallized-npc-memory-enabled" type="checkbox" style="width:auto;margin:0;" /> NPC Memory Bank (per-NPC POV recollections)
              </label>

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized Distillation Interval (K turns)</label>
              </div>
              <input id="crystallized-interval" type="number" min="1" placeholder="20" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized Entry Max Characters</label>
              </div>
              <input id="crystallized-max-chars" type="number" min="100" max="1000" placeholder="900" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized Node Cap (max active nodes)</label>
              </div>
              <input id="crystallized-node-cap" type="number" min="1" placeholder="12" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Crystallized NPC Memory Bank size (max stored memories)</label>
              </div>
              <input id="crystallized-npc-memory-cap" type="number" min="1" placeholder="400" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Rendered layer caps</label>
              </div>
              <div style="display:flex;gap:6px;margin:4px 0 2px 0;">
                <input id="crystallized-knows-cap" class="input-compact" type="number" min="1" placeholder="2" title="Max Knows lines (characters prioritized)" style="margin:0;flex:1;" />
                <input id="crystallized-recalls-cap" class="input-compact" type="number" min="0" placeholder="2" title="Max Recalls lines (scene memory pulls; 0 disables)" style="margin:0;flex:1;" />
                <input id="crystallized-vivid-cap" class="input-compact" type="number" min="1" placeholder="4" title="Max Vivid Memory lines" style="margin:0;flex:1;" />
                <input id="crystallized-outlook-cap" class="input-compact" type="number" min="1" placeholder="2" title="Max Outlook lines" style="margin:0;flex:1;" />
                <input id="crystallized-preferences-cap" class="input-compact" type="number" min="1" placeholder="4" title="Max Preferences lines (concrete texture: tastes, quirks, habits)" style="margin:0;flex:1;" />
              </div>
              <div style="display:flex;gap:6px;margin:0 0 8px 0;">
                <label class="input-caption">Knows</label>
                <label class="input-caption">Recalls</label>
                <label class="input-caption">Vivid</label>
                <label class="input-caption">Outlook</label>
                <label class="input-caption">Prefs</label>
              </div>
            </div>

            <!-- Pane: Living Characters Settings -->
            <div id="tab-living-characters" class="tab-pane" style="display:none; flex-direction:column; gap:8px;">
              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="enable-living-characters" type="checkbox" style="width:auto;margin:0;" />
                  Enable Living Characters Integration?
                </label>
              </div>

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Life Card Title Prefix</label>
              </div>
              <input id="lc-title-prefix" type="text" placeholder="Life - " style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 4px 0;">
                <label style="margin:0;flex:1;">Life Card Key Prefix</label>
              </div>
              <input id="lc-key-prefix" type="text" placeholder="chaos-v2:" style="margin:4px 0 8px 0;" />

              <div style="display:flex;align-items:center;gap:6px;margin:8px 0 12px 0;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;flex:1;">
                  <input id="group-thoughts-in-roster" type="checkbox" style="width:auto;margin:0;" />
                  Group Thought Cards in Roster?
                </label>
              </div>

              <div class="note" style="margin-top:12px; padding:10px; border-radius:6px; border:1px solid var(--border-color); background:rgba(255,255,255,0.02); font-size:10.5px; line-height:1.4; color:var(--text-secondary);">
                <strong>Living Characters Engine</strong><br/>
                Developed by <a href="https://github.com/LivingNarratives" target="_blank" style="color:var(--accent-color); text-decoration:none; font-weight:600;">Living Narratives</a> (<a href="https://www.reddit.com/user/Jrowe0311/" target="_blank" style="color:var(--accent-color); text-decoration:none; font-weight:600;">u/Jrowe0311</a>).
                <br/>
                Incorporated with explicit permission to simulate autonomous NPC thoughts, relationships, and social dynamics.
              </div>
            </div>
            
            <!-- Pane: AI Provider -->
            <div id="tab-prov" class="tab-pane" style="display:none;">
              <label>Provider</label>
              <select id="prov" style="margin:4px 0 8px 0;">
                <option value="claude">Anthropic Claude</option>
                <option value="openai">OpenAI ChatGPT</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Local Ollama</option>
              </select>
              
              <label id="key-lbl">Claude API key</label>
              <input id="key" type="password" placeholder="sk-ant-..." style="margin:4px 0 8px 0;" />
              
              <label>Model</label>
              <select id="model" style="margin:4px 0 8px 0;"><option value="">(enter API key)</option></select>
            </div>
            
            <!-- Pane: Prompts -->
            <div id="tab-prompts" class="tab-pane" style="display:none;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px;width:100%;box-sizing:border-box;">
                <details style="border:none;background:none;margin:0;padding:0;flex:1;overflow:visible;">
                  <summary style="cursor:pointer;font-size:10px;font-weight:600;color:var(--accent-color);padding:0 24px 0 0;background:none;display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;">
                    <span>Available Dynamic Tags</span>
                  </summary>
                  <div style="margin-top:4px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;font-size:9.5px;color:var(--text-secondary);line-height:1.4;box-sizing:border-box;width:100%;">
                    <div><code style="color:var(--accent-color);font-weight:bold;">{protagonist}</code> - Replaced by us with the protagonist name (from General, or auto-detected from Plot Essentials) before sending.</div>
                    <div style="margin-top:3px;"><code style="color:var(--accent-color);font-weight:bold;">{{title}}</code> - Resolved by AI Dungeon to the Story Card's title. Required in every Card Command.</div>
                  </div>
                </details>
                <button id="revert-prompt" class="btn-micro btn-micro--red" style="white-space:nowrap;align-self:flex-start;">\u21BA Revert All</button>
              </div>

              <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Plot Essentials Prompt (your AI provider)</h4>
              <div class="note" style="margin-bottom:4px;">Drives Plot Essentials updates via your configured provider (Claude/GPT/etc). Story Cards are generated through the same provider below.</div>
              <label style="margin-top:6px;">1. General Instructions</label>
              <textarea id="prompt-s1" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">2. Personality & Identity Rules</label>
              <textarea id="prompt-s2" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">3. Limits & Budget Ceilings</label>
              <textarea id="prompt-s3" rows="5" style="margin:4px 0 8px 0;"></textarea>
              
              <label style="margin-top:6px;">4. Output JSON Schema</label>
              <textarea id="prompt-s4" rows="5" style="margin:4px 0 8px 0;"></textarea>

              <div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:8px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Per-Type Card Command Templates</h4>
                <div class="note" style="margin-bottom:6px;">Sent to your configured AI provider to generate the card. Use <code>{{title}}</code> (required) and <code>{protagonist}</code>. Custom covers any user-named type (e.g. "Song").</div>

                <label style="margin-top:6px;">Entry Formatting</label>
                <select id="fmt-mode" style="margin:4px 0 8px 0;">
                  <option value="squareBrackets">[ ] Square brackets</option>
                  <option value="curlyBraces">{ } Curly braces</option>
                  <option value="none">None</option>
                </select>

                <label style="margin-top:6px;">Character</label><textarea id="cc-character" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Class</label><textarea id="cc-class" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Race</label><textarea id="cc-race" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Location</label><textarea id="cc-location" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Faction</label><textarea id="cc-faction" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Custom</label><textarea id="cc-custom" rows="6" style="margin:4px 0 6px 0;"></textarea>
                <label style="margin-top:6px;">Memoraid</label><textarea id="cc-memoraid" rows="6" style="margin:4px 0 6px 0;"></textarea>
              </div>
            </div>
            
            <!-- Pane: Debug / Exports -->
            <div id="tab-debug" class="tab-pane" style="display:none;">
              <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Granular Database Exports</h4>
              <div class="note" style="margin-bottom:8px;">Select an export type to download the data:</div>
              
              <div style="display:flex;flex-direction:column;gap:6px;width:100%;">
                <button id="ex-story" class="btn-export">
                  <span>\u2B07 Just Story Actions JSON</span>
                </button>
                <button id="ex-cards" class="btn-export">
                  <span>\u2B07 Just Story Cards JSON</span>
                </button>
                <button id="ex-pe" class="btn-export">
                  <span>\u2B07 Just Plot Essentials Plaintext</span>
                </button>
                <button id="ex-aidmemories" class="btn-export">
                  <span>\u2B07 Just Memory Bank JSON</span>
                </button>
                <button id="ex-propernouns" class="btn-export">
                  <span>\u2B07 Just Proper Noun Logs JSON</span>
                </button>
                <button id="ex-all" class="btn-export" style="background:rgba(245,158,11,0.05);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);">
                  <span>\u2B07 All Combined Backup JSON</span>
                </button>
              </div>

              <h4 style="margin:14px 0 4px;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Diagnostics</h4>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:4px 0;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="show-dbg" type="checkbox" style="width:auto;margin:0;" />
                Verbose debug logging (Console)
              </label>
              <div class="note">Logs detailed internal extension activity to the browser Console (developer diagnostic \u2014 noisy).</div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:8px 0 4px;font-weight:bold;color:var(--text-secondary);font-size:11px;text-transform:none;letter-spacing:normal;">
                <input id="log-pe-console" type="checkbox" style="width:auto;margin:0;" />
                Log Raw Update Plot Essentials to Console
              </label>
              <div class="note">When enabled, logs ONLY the raw AI request/response from the last Update Plot Essentials run to the browser Console (open DevTools \u2192 Console). Independent of verbose logging above.</div>
              
              <div style="margin-top:14px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Learned Operations</h4>
                <div id="learned-ops-list" style="font-family:SFMono-Regular,Consolas,monospace;font-size:9.5px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;margin-top:4px;color:var(--text-primary);max-height:80px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;">None</div>
              </div>

              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                  <h4 style="margin:0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Proper Noun Log Editor</h4>
                  <button id="clear-pn-logs" class="btn-micro btn-micro--red">Clear All</button>
                </div>
                <div class="note" style="margin-bottom:6px;">Review or delete proper nouns processed by auto-detection.</div>
                <div id="pn-logs-list" style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:6px;padding:6px;box-sizing:border-box;">
                  <!-- Proper noun log items -->
                </div>
              </div>
              
              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Mobile Settings Sync (QR Code)</h4>
                <div class="note" style="margin-bottom:8px;">Generate a QR code to sync settings (excluding API keys) directly to your mobile device.</div>
                <button id="gen-qr-btn" type="button" class="btn" style="justify-content:center;background:rgba(168,85,247,0.08);color:#c084fc;border:1px solid rgba(168,85,247,0.25);padding:6px 12px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;width:100%;box-sizing:border-box;">Generate Sync QR Code</button>
              </div>

              <div style="margin-top:14px;border-top:1px solid var(--border-color);padding-top:10px;">
                <h4 style="margin:4px 0;font-size:10.5px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Full Database Backup & Restore</h4>
                <div class="note" style="margin-bottom:8px;">Back up the entire local database (settings, cards, versions, operations, histories) to a single file.</div>
                <div style="display:flex;gap:6px;width:100%;">
                  <button class="db-backup-trigger" style="flex:1;justify-content:center;background:rgba(16,185,129,0.08);color:#34d399;border:1px solid rgba(16,185,129,0.25);padding:6px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;">Back Up Database</button>
                  <button class="db-restore-trigger" style="flex:1;justify-content:center;background:rgba(245,158,11,0.08);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);padding:6px;font-weight:600;font-size:11px;border-radius:6px;cursor:pointer;">Restore from Backup</button>
                </div>
              </div>
            </div>
            
            <!-- Pane: OffMeta's AIN Repository -->
            <div id="tab-offmeta" class="tab-pane" style="display:none; flex-direction:column; gap:8px; overflow:hidden;">
              <h4 style="margin:4px 0;font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">OffMeta's AIN Repository</h4>
              <div class="note" style="margin-bottom:4px; font-size:11px;">Apply curated instructions directly to your AI Instructions, Author's Note, or Plot Essentials.</div>
              
              <!-- Sub Tab Navigation -->
              <div class="offmeta-subtab-nav sub-tab-nav" style="padding-bottom:4px;margin-bottom:6px;gap:2px;">
                <button class="subtab-btn offmeta-subtab-btn active" data-subtab="offmeta-subtab-intro">Introduction</button>
                <button class="subtab-btn offmeta-subtab-btn" data-subtab="offmeta-subtab-premade">Premade AIN</button>
                <button class="subtab-btn offmeta-subtab-btn" data-subtab="offmeta-subtab-anpe">AN/PE</button>
                <button class="subtab-btn offmeta-subtab-btn" data-subtab="offmeta-subtab-individual">Individual AIN</button>
              </div>

              <!-- Search box and status feedback -->
              <div id="offmeta-search-container" style="display:none; flex-direction:column; gap:6px; margin-bottom:4px;">
                <input id="offmeta-search" type="text" placeholder="Search instructions (e.g. repetition, romance)..." style="width:100%; box-sizing:border-box; margin:0; font-size:11.5px; padding:5px 8px;" />
                <div id="offmeta-status" style="font-size:11px; display:none; padding:4px 8px; border-radius:4px; font-weight:600; line-height:1.35; margin-top:2px;"></div>
              </div>

              <!-- Repository container -->
              <div id="offmeta-repo-container" class="scrollable-panel scrollable-panel--column" style="gap:12px;">
                <!-- Loading State placeholder -->
                <div style="text-align:center; padding:30px; color:var(--text-secondary);">
                  <div class="spinner" style="width:16px; height:16px; margin-bottom:6px; border-width:2px;"></div>
                  <div>Fetching rules from Google Doc...</div>
                </div>
              </div>
            </div>
            
            <!-- Pane: Adventures Manager -->
            <div id="tab-manager" class="tab-pane" style="display:none; flex-direction:column; gap:8px; overflow:hidden;">
              <h4 style="margin:4px 0;font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.03em;">Adventures Manager</h4>
              <div class="note" style="margin-bottom:4px; font-size:11px;">Manage your Favorites library and explore locally stored adventure data.</div>

              <!-- Full DB Backup / Restore (entire IndexedDB incl. adventures, cards, thoughts, settings & Favorites) -->
              <div style="display:flex;gap:6px;margin-bottom:6px;">
                <button class="db-backup-trigger" style="flex:1;margin:0;padding:6px 8px;font-size:10.5px;font-weight:700;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.25);border-radius:6px;cursor:pointer;" title="Back up the entire local database to a JSON file (survives swapping the signed XPI for a test build)">\u2B07 Back Up Database</button>
                <button class="db-restore-trigger" style="flex:1;margin:0;padding:6px 8px;font-size:10.5px;font-weight:700;background:rgba(245,158,11,0.1);color:#fbbf24;border:1px solid rgba(245,158,11,0.25);border-radius:6px;cursor:pointer;" title="Restore the entire local database from a backup JSON file">\u2B06 Restore Database</button>
              </div>

              <!-- Sub Tab Navigation -->
              <div class="manager-subtab-nav sub-tab-nav" style="padding-bottom:4px;margin-bottom:6px;gap:2px;">
                <button id="btn-subtab-global" class="subtab-btn active">Favorites</button>
                <button id="btn-subtab-explorer" class="subtab-btn">Local DB Explorer</button>
              </div>

              <!-- Main Manager Container -->
              <div id="manager-panels" class="scrollable-panel scrollable-panel--column" style="gap:8px;">
                <!-- Subpane: Favorites -->
                <div id="subpane-global" style="display:flex; flex-direction:column; gap:8px;">
                  <button id="btn-show-add-global" class="btn-primary" style="width:100%;margin:0;padding:6px;font-size:11px;">+ Add New Favorite</button>
                  
                  <!-- Form: Add Favorite (hidden by default) -->
                  <div id="form-add-global" style="display:none; flex-direction:column; gap:6px; background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:8px; padding:10px; box-sizing:border-box;">
                    <div style="font-weight:600; font-size:11px; color:var(--theme-text-color); margin-bottom:4px;">New Favorite</div>
                    <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Asset Type</label>
                    <select id="global-type" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;">
                      <option value="ain">AI Instructions (AIN)</option>
                      <option value="an">Author's Note (AN)</option>
                      <option value="pe">Character Description (PE)</option>
                      <option value="sc">Story Card (SC)</option>
                    </select>

                    <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Title / Name</label>
                    <input id="global-title" type="text" placeholder="e.g. My Custom Rules or Character Name" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;" />

                    <!-- SC specific fields -->
                    <div id="sc-fields" style="display:none; flex-direction:column; gap:6px;">
                      <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Story Card Type</label>
                      <select id="global-sc-type" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;">
                        <option value="character">Character</option>
                        <option value="location">Location</option>
                        <option value="faction">Faction</option>
                        <option value="class">Class</option>
                        <option value="race">Race</option>
                        <option value="custom">Custom</option>
                      </select>

                      <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Keys / Triggers (comma-separated)</label>
                      <input id="global-keys" type="text" placeholder="e.g. elf,legolas" style="margin:2px 0 6px 0; font-size:11.5px; padding:4px;" />

                      <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Description (Notes/Thought Log)</label>
                      <textarea id="global-description" rows="2" placeholder="Sleek details..." style="margin:2px 0 6px 0; font-size:11.5px; padding:4px; font-family:inherit; resize:vertical;"></textarea>
                    </div>

                    <label style="font-size:10px; text-transform:uppercase; color:var(--text-secondary);">Content / Instruction Value</label>
                    <textarea id="global-value" rows="4" placeholder="Enter content or instructions here..." style="margin:2px 0 6px 0; font-size:11.5px; padding:4px; font-family:inherit; resize:vertical;"></textarea>

                    <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:4px;">
                      <button id="btn-cancel-global" class="btn-cancel" style="margin:0;">Cancel</button>
                      <button id="btn-save-global" style="margin:0; padding:4px 10px; font-size:11px; background:var(--accent-color); color:#fff; border-radius:6px; border:none; font-weight:600;">Create</button>
                    </div>
                  </div>

                  <!-- Global Assets Categorized Lists -->
                  <div id="global-assets-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                </div>

                <!-- Subpane: Local DB Explorer -->
                <div id="subpane-explorer" style="display:none; flex-direction:column; gap:8px;">
                  <div id="db-explorer-list" style="display:flex; flex-direction:column; gap:8px;"></div>
                  <div style="display:flex; justify-content:flex-start; margin-top:8px;">
                    <button id="btn-view-hidden-adv" style="background:none !important; border:none !important; box-shadow:none !important; transform:none !important; padding:4px 0; color:var(--text-secondary); text-decoration:underline; font-size:10.5px; cursor:pointer; font-family:inherit; transition:color 0.2s;" onmouseover="this.style.color='var(--theme-text-color)'" onmouseout="this.style.color='var(--text-secondary)'">View Hidden Adventures</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Actions footer for settings view -->
          <div id="settings-footer" style="display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--border-color);padding-top:8px;margin-top:4px;">
            <button id="cancel-settings" class="btn-cancel" style="margin:0;">Cancel</button>
            <button id="save" class="btn-primary" style="margin:0;min-width:70px;padding:4px 10px;">Save</button>
          </div>
        </div>

        <!-- VIEW: UPDATE PLOT ESSENTIALS (Analyze) -->
        <div id="view-analyze" style="display:none;flex-direction:column;gap:10px;margin-top:8px;flex:1;overflow:hidden;min-height:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color);padding-bottom:6px;">
            <div style="font-weight:600;color:var(--accent-color);font-size:13px;">\u27F3 Update Plot Essentials</div>
            <button id="analyze-back" style="margin:0;background:rgba(255,255,255,0.02);padding:4px 10px;border-radius:6px;">\u2190 Back</button>
          </div>
          <div id="analyze-body" class="scrollable-panel"></div>
        </div>

        <!-- VIEW: FULL-PANEL EDITOR (Mobile Rethink Phase B) -->
        <div id="view-editor" style="display:none;flex-direction:column;gap:10px;margin-top:8px;flex:1;overflow:hidden;min-height:0;">
          <div style="display:flex;justify-content:flex-start;align-items:center;gap:10px;border-bottom:1px solid var(--border-color);padding-bottom:6px;">
            <button id="editor-back" style="margin:0;background:rgba(255,255,255,0.02);padding:4px 10px;border-radius:6px;flex-shrink:0;">\u2190 Back</button>
            <div id="editor-title" style="font-weight:600;color:var(--accent-color);font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Editor</div>
          </div>
          <div id="editor-body" class="scrollable-panel" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>

        <!-- OVERLAY: MEMORIES HELP -->
        <div id="overlay-memories" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Memories Block Feature</div>
            <button class="overlay-close" type="button" data-close="overlay-memories">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>When enabled, the tracker will automatically manage a <strong>[Memories (newest to oldest): ...]</strong> block inside your adventure's Plot Essentials.</p>
            <p><strong>Setup Format:</strong><br/>Create a block in your Plot Essentials exactly like this:</p>
            <div class="code-card" style="margin:4px 0;"><pre>[Memories (newest to oldest):
- latest memory here
- something that happened before that
]</pre></div>
            <p><strong>How it works:</strong><br/>The AI analyzes your gameplay actions, summarizes new events, and automatically prepends them as new bullet points to keep a continuous running history of your story.</p>
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:8px 12px;color:#fbe3b4;display:flex;gap:8px;align-items:flex-start;">
              <svg style="width:16px;height:16px;fill:currentColor;flex-shrink:0;margin-top:2px;" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
              <span><strong>Note:</strong> A longer lookback window (e.g. 60+ actions) is highly recommended for the AI to have enough context to generate high-quality, continuous memories.</span>
            </div>
          </div>
        </div>

        <!-- OVERLAY: ACTION LOOKBACK HELP -->
        <div id="overlay-action-lookback" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Action Lookback Window</div>
            <button class="overlay-close" type="button" data-close="overlay-action-lookback">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls the number of recent gameplay actions and the resulting text from AI Dungeon sent to your third-party provider for story card updates.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID LOOKBACK HELP -->
        <div id="overlay-memoraid-lookback" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Action Lookback Window</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-lookback">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many prior actions are sent to the model for thought generation.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID THOUGHT LOOKBACK HELP -->
        <div id="overlay-memoraid-thought" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Thought Lookback (previous thoughts)</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-thought">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>Turns each NPC's memory card into a rolling "Inner Self" cache: the card entry keeps the last <strong>N</strong> complete thoughts (newest on top), and those same prior thoughts are fed back as context when generating the next thought \u2014 so the character's internal monologue stays continuous instead of resetting every turn.</p>
            <p><strong>How it works:</strong><br/>Each turn the newest thought enters at the top and the rest roll down; the oldest beyond N leaves the visible entry but stays archived in the card's Notes log. Minimum <strong>1</strong> (the current thought). Recent story actions are NOT added here: AI Dungeon already generates with full story context.</p>
          </div>
        </div>

        <!-- OVERLAY: MEMORAID PRESENCE HELP -->
        <div id="overlay-memoraid-presence" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">MemorAID Scene Presence Lookback</div>
            <button class="overlay-close" type="button" data-close="overlay-memoraid-presence">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many actions (turns) the extension looks back to check if an NPC has been active or mentioned in the scene to trigger the MemorAID intercept and update.</p>
            <p><strong>How it works:</strong><br/>Each time you enter an action, the extension scans the last <code>N</code> actions (defined by this window) to see if an important character is present. If they are detected, it runs the intercept and updates the thought cards. A smaller window keeps the detection tightly focused on the immediate scene, while a larger window allows characters to stay active even after a few turns of silence.</p>
          </div>
        </div>

        <!-- OVERLAY: INTERCEPT TIMEOUT HELP -->
        <div id="overlay-intercept-timeout" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Action Intercept Timeout</div>
            <button class="overlay-close" type="button" data-close="overlay-intercept-timeout">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This setting controls how many seconds the extension pauses your gameplay actions to wait for NPC thought cards to regenerate before releasing the turn.</p>
            <p><strong>How it works:</strong><br/>When you submit an action in a scene with active characters, the extension intercepts it and triggers background thought updates. It holds your action up to this timeout to let the AI updates finish and show in the input placeholder. Increase this if you have multiple active NPCs to ensure all their thoughts update before the turn is released.</p>
          </div>
        </div>

        <!-- OVERLAY: CREATE NEW STORY CARD -->
        <div id="overlay-add-card" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">Create New Story Card</div>
            <button class="overlay-close" type="button" data-close="overlay-add-card">\xD7</button>
          </div>
          <div class="overlay-content" style="gap:10px;">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Card Type</label>
              <select id="ac-type" class="input-compact" style="margin:2px 0 4px 0;"></select>
              <input type="text" id="ac-custom-type" list="existing-custom-types" placeholder="Enter custom type\u2026" class="input-compact" style="display:none;margin:2px 0 4px 0;" />
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Name / Title</label>
              <input id="ac-title" type="text" placeholder="e.g. Rena" class="input-compact" style="margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Trigger Keys (comma-separated)</label>
              <input id="ac-keys" type="text" placeholder="e.g. rena, merchant" class="input-compact" style="margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Description / Notes</label>
              <input id="ac-desc" type="text" placeholder="e.g. Optional notes" class="input-compact" style="margin:2px 0 4px 0;"/>
            </div>

            <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-height:0;">
              <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Entry Value (Body)</label>
              <textarea id="ac-value" placeholder="The core story card content..." class="input-compact" style="resize:none;flex:1;min-height:80px;box-sizing:border-box;margin:2px 0 4px 0;"></textarea>
            </div>

            <button id="ac-submit" class="btn-primary" style="width:100%;margin-top:4px;padding:8px;font-size:11px;">Create & Push to AID</button>
          </div>
        </div>

        <!-- OVERLAY: GENERAL ABOUT & HELP -->
        <div id="overlay-help" class="overlay">
          <div class="overlay-header">
            <div class="overlay-title">About & How it Works</div>
            <button class="overlay-close" type="button" data-close="overlay-help">\xD7</button>
          </div>
          <div class="overlay-content">
            <p>This extension orchestrates context tracking and memory management for your AI Dungeon adventures, generating all updates through your own configured AI provider.</p>
            
            <p><strong>1. Architectural Division: PE vs SC</strong></p>
            <ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:8px;">
              <li>
                <strong>Plot Essentials (PE):</strong> 
                Character blocks embedded directly inside your adventure's main memory context. Updates are fully driven by <strong>your configured outside AI Provider API</strong> (Claude, OpenAI GPT, Gemini, or local Ollama).
                <br/><span class="note" style="margin-top:2px;display:inline-block;">*Includes an option (enabled via <strong>Settings \u2192 General \u2192 Use Memories in Plot Essentials?</strong>) to automatically construct and prepend a dynamic Memories block in Plot Essentials via outside AI calls.</span>
              </li>
              <li>
                <strong>Story Cards (SC):</strong>
                World Info elements stored in AI Dungeon's database. Updates are driven by <strong>your configured AI provider</strong>, using the command instruction templates defined in settings, then saved back to the card.
              </li>
            </ul>

            <p><strong>2. Gameplay Context Window Integration</strong></p>
            <p>When generating Story Card updates, the extension dynamically captures the last <code>N</code> actions of chronological gameplay history (up to a <strong>strict 2,000-character ceiling</strong>, including newlines) and includes it in the generation prompt sent to your configured AI provider. For Location cards, the current card description is automatically prepended, reserving all remaining character budget for recent gameplay actions.</p>

            <p><strong>3. Automated Action Lookback Active Tracker</strong></p>
            <p>The tracker continuously monitors action progression in the background. If a character's name or trigger words were present in the previous lookback window but disappear from the current window (indicating <strong>they have just fell out of active gameplay actions / exited the active scene</strong>), the extension automatically and silently triggers a card update in the background.</p>
            <p>A new pending proposal is generated immediately, ready for you to review, accept, or reject the moment you open the Tracker panel!</p>

            <p><strong>4. How it Determines Characters</strong></p>
            <p>The tracker parses your adventure's Plot Essentials memory to identify existing characters by looking for these patterns:</p>
            <ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px;">
              <li><code>Your name: Smoke</code> (identifies the protagonist)</li>
              <li><code>[Name is/are ...]</code> or <code>Name is/are ...</code></li>
              <li><code>[Name: ...]</code> or <code>Name: ...</code></li>
            </ul>

            <p><strong>5. MemorAID NPC Thought Tracking</strong></p>
            <p>The extension intercepts outgoing player actions to generate and synchronize thoughts for active NPCs in companion thought cards.
            <br/><span class="note" style="margin-top:2px;display:inline-block;">*Settings under the MemorAID tab allow you to define the lookback size and customize the intercept release timeout to wait for background thought updates to finish before releasing the turn.</span></p>

            <p><strong>6. Memory Bank & Auto-Regeneration</strong></p>
            <p>You can edit and refine individual AI Dungeon memory blocks directly from the Memory Bank tab.
            <br/><span class="note" style="margin-top:2px;display:inline-block;">*Enabling <strong>Settings \u2192 General \u2192 Automatically regen latest Memory Bank entry?</strong> automatically runs memory block refinement on the latest memory block whenever new actions are synchronized, using loop-safe diffing to prevent endless loops.</span></p>
          </div>
        </div>
      </div>
    </div>`;
  }

  // src/content/setup-phase.ts
  function isSetupPhase(input) {
    return !input.isManagerOnly && (input.hasActiveSetupQuestion || input.actionCount < 2);
  }
  function visibleMainTabPane(inSetupPhase, activeTabId) {
    return inSetupPhase ? "main-tab-tracker" : activeTabId;
  }

  // src/inference/plot.ts
  var LORE_HINTS = /inner circle|plot secret|^secret\b|^-?\s*plot\b/i;
  function blockName(inner) {
    const text = inner.trim();
    const firstLine = (text.split("\n").find((l) => l.trim()) ?? "").trim();
    const pm = text.match(/(?:Your|Player)\s+name:\s*([^\n]+)/i);
    if (pm) return { name: pm[1].trim(), isPlayer: true };
    if (LORE_HINTS.test(firstLine)) return null;
    if (/^(?:Current|Active)\s+Location/i.test(firstLine)) return null;
    const nm = firstLine.match(/^([A-Z][^\n:]*?)\s+(?:is|are)\b/);
    if (nm) return { name: nm[1].trim(), isPlayer: false };
    const hm = firstLine.match(/^([A-Z][\w '´.-]{1,40}):/);
    if (hm && !LORE_HINTS.test(hm[1])) return { name: hm[1].trim(), isPlayer: false };
    return null;
  }
  function parsePlotEssentials(memory) {
    if (!memory) return [];
    const blocks = [];
    const re = /\[([^\]]+)\]|\{([^\}]+)\}/g;
    let m;
    while ((m = re.exec(memory)) !== null) {
      const content = m[1] !== void 0 ? m[1] : m[2];
      const info = blockName(content);
      if (info) blocks.push({ name: info.name, text: content.trim(), isPlayer: info.isPlayer });
    }
    return blocks;
  }
  function getRestOfPlotEssentials(memory) {
    if (!memory) return "";
    const re = /\[([^\]]+)\]|\{([^\}]+)\}/g;
    let lastIndex = 0;
    let result = "";
    let m;
    while ((m = re.exec(memory)) !== null) {
      const content = m[1] !== void 0 ? m[1] : m[2];
      const info = blockName(content);
      if (info) {
        result += memory.slice(lastIndex, m.index);
        lastIndex = re.lastIndex;
      }
    }
    result += memory.slice(lastIndex);
    return result.trim();
  }
  var DETAIL_KEYWORDS = /\b(name|age|gender|sex|race|species|height|weight|build|hair|eye|eyes|skin|scent|smell|voice|appearance|apparel|clothing|outfit|attire|looks?|personality|occupation|job|role|class|alignment|likes|dislikes|hobbies|fears?|goals?|motivations?|motives?|background|backstory|origin|description|bio|relationship|status|title|rank|weapons?|equipment|abilities|skills|powers|strengths?|weakness(?:es)?|quirks|mannerisms|demeanor|attitude|disposition|temperament|nationality|orientation|hand|iq)\b/i;
  var DETAIL_CANDIDATE_RE = /([-*[])?\s*([A-Za-z][A-Za-z0-9_&/'"-]*(?:\s+[A-Za-z0-9_&/'"][A-Za-z0-9_&/'"-]*)*?)\s*[:=]/g;
  function isDetailKey(key, bulleted) {
    const k = key.trim();
    if (!k || k.length > 40) return false;
    if (bulleted) return true;
    const spaces = (k.match(/\s/g) || []).length;
    if (DETAIL_KEYWORDS.test(k) && spaces <= 2) return true;
    if (spaces <= 1 && k.length < 15) return true;
    return false;
  }
  function extractDetailsFromText(text) {
    if (!text) return [];
    const candidates = [];
    DETAIL_CANDIDATE_RE.lastIndex = 0;
    let m;
    while ((m = DETAIL_CANDIDATE_RE.exec(text)) !== null) {
      candidates.push({
        key: m[2],
        bulleted: m[1] !== void 0,
        matchStart: m.index,
        valStart: DETAIL_CANDIDATE_RE.lastIndex
      });
    }
    const clean = (s) => s.replace(/[\s\]]+$/, "").replace(/\s+/g, " ").trim();
    const results = [];
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const end = i + 1 < candidates.length ? candidates[i + 1].matchStart : text.length;
      const value = clean(text.slice(c.valStart, end));
      const key = c.key.trim();
      if (isDetailKey(key, c.bulleted)) {
        if (/^(?:https?|www|ftp)$/i.test(key)) continue;
        if (value) results.push({ key, value });
      } else if (results.length) {
        const prev = results[results.length - 1];
        prev.value = clean(`${prev.value} ${key}: ${value}`);
      }
    }
    return results;
  }

  // src/inference/engine.ts
  var DEFAULT_PROMPT_SECTION_1 = [
    "You maintain character descriptions for an interactive, second-person, present-tense story.",
    '"You"/"your" always refers to the player character named {protagonist}.',
    "Each `characters` entry has a name, currentEntry, and source: 'plot' = part of the always-in-context Plot Essentials (central/player characters); 'card' = a Story Card (only present when triggered).",
    "Propose action:\"update\" ONLY for characters in `characters` whose state the narrative has concretely changed. Preserve the Entry's existing labeled sections (e.g. 'Appearance:','Personality:') and revise only what the evidence supports.",
    "Do NOT invent new characters and do NOT create Story Cards. Only update entries already provided in `characters`."
  ].join("\n");
  var DEFAULT_PROMPT_SECTION_2 = [
    "CORE PERSONALITY ESSENCE & COMPRESSION RULES:",
    "  - Focus strictly on 'Core Personality Trait' changes and behavioral shifts, keeping only the barest high-level context to explain why their personality has changed that way. We want to capture the character's essence, psychological filters, and worldview rather than log their story actions or situational scenes.",
    "  - For Appearance, focus on what the character 'usually' looks like (e.g., physical features, default public wardrobe, characteristic style) and typical habits (e.g. public wardrobe choices vs. private/at-home preferences). Absolutely ban transient physical states or highly situational details (e.g., do NOT log smudged mascara, exhausted/red eyes, or specific outfits from a single scene; instead record: 'Usually dresses strategically in public to project a desired image, but now prefers oversized, comfortable clothing in private or safe settings').",
    "  - Absolutely forbid narrative 'fluff', specific dialogue summaries, situational scene recaps, transient settings, item logs, or passing interactions (e.g. do NOT write about coffee orders, penthouse scenes, or specific conversations; instead, record the permanent psychological shift and its driver, e.g. 'Motivated by Smoke's public authenticity, she has discarded her manipulative schemes and is resolved to take ownership of her past rumor campaign against Mia').",
    "  - DO NOT repeat or include descriptions of other characters' actions, status, or behaviors (e.g. do NOT write about how Smoke treats A-list women or what he does; focus *strictly* on the target character's own internal traits).",
    "  - Reference established groups or roles where applicable (e.g. refer to a character's associates collectively as their 'inner circle' if defined in context, rather than listing individual names like Chloe, Jasmine, Marcus, etc. redundantly).",
    "  - Treat entries as active, lightweight, high-density LLM instruction guides for roleplaying the character, not as a story timeline.",
    "  - [CRITICAL RELATIONSHIP PACING DIRECTIVE]: When updating the 'Dynamic ({protagonist}):' relationship field, you must enforce realistic psychological inertia and continuity based strictly on the character's pre-existing profile. Relationships cannot leap from strangers or casual acquaintances to deep intimacy, unearned trust, or intense codependency\u2014nor to absolute hatred, permanent enmity, or extreme paranoia\u2014within a handful of turns. Transition updates must capture the messy, realistic friction of changes (e.g. emotional whiplash, caution, or cognitive dissonance) and show progressive organic softening or hardening, rather than sudden extreme swings or total psychological submission. Focus strictly on the immediate realistic increment of their interaction."
  ].join("\n");
  var DEFAULT_PROMPT_SECTION_3 = [
    "PLOT ESSENTIALS vs. STORY CARDS LIMITS (CEILINGS, NOT TARGETS):",
    "    * Limits are absolute emergency ceilings: 3,500 characters for the protagonist ({protagonist}), and 2,000 characters for all other central Plot Essentials or Story Cards.",
    "    * Limits are NOT targets. Shorter, high-density entries are highly preferred. If a character description can be kept at 600 characters, do NOT write 1,900 characters. Padding or inflating an entry with decorative adjectives or unnecessary narrative history is a failure.",
    "    * Do not use the available character budget just because it exists. Conserve as much space as possible so the total story context window remains large.",
    "    * When proposing an update, prioritize pruning, condensing, or deleting outdated/redundant information so that new updates do not continuously grow the character's size."
  ].join("\n");
  var DEFAULT_PROMPT_SECTION_4 = [
    "Never fabricate details absent from both the entry and the narrative. changeSummary is a short plain-English line describing what changed.",
    'Respond with STRICT JSON only: {"proposals":[{"name","action":"update","newEntry","changeSummary","suggestedTriggers"?}]}. Return {"proposals":[]} if nothing changed.'
  ].join("\n");
  var DEFAULT_SYSTEM_PROMPT = [
    DEFAULT_PROMPT_SECTION_1,
    DEFAULT_PROMPT_SECTION_2,
    DEFAULT_PROMPT_SECTION_3,
    DEFAULT_PROMPT_SECTION_4
  ].join("\n\n");
  var STD_TYPES = /* @__PURE__ */ new Set(["character", "class", "race", "location", "faction", "memoraid"]);
  function normalizeType(t) {
    const x = (t ?? "character").toLowerCase();
    return STD_TYPES.has(x) ? x : "custom";
  }

  // src/inference/card-command.ts
  var DEFAULT_CARD_COMMANDS = {
    character: `Generate an information card entry for {{title}} in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. The entry is injected into the story WITHOUT its card title, so it MUST self-identify: begin with the field Name: {{title}} on its own first line, then a Type: line stating what {{title}} is (role, species, or station). Then continue with these labeled fields, each on its own line:
Appearance: 1-2 sentences on enduring physical features and style.
Complexity (Paradox & Filters): 1-2 sentences on their central internal contradiction/repressed vulnerability and how they screen reality.
Goals: 1-2 sentences on their primary desires, motivations, and what they seek or fear in the current situation.
Update based strictly on concrete narrative changes, preserving existing labeled fields on their own lines. Keep it high-density and under 600 characters total to prevent server truncation. Forbid narrative fluff, scene recaps, and empty lines. Treat this as a high-density roleplay guide, not a story timeline.`,
    class: `Generate an information card entry for {{title}}, a character class or archetype in the D&D/MMO sense, in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. The entry is injected into the story WITHOUT its card title, so it MUST self-identify: begin with the field Name: {{title}} on its own first line, then a Type: line (e.g. Type: Class / Archetype). Then continue with labeled fields (e.g., Role:, Abilities:, Progression:) on their own lines, revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Focus on the class's defining role, signature abilities and skills, mechanics, and how it has progressed or changed \u2014 not story events or scenes. Forbid narrative fluff, dialogue summaries, scene recaps, transient details, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    race: `Generate an information card entry for {{title}}, a species or race, in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. The entry is injected into the story WITHOUT its card title, so it MUST self-identify: begin with the field Name: {{title}} on its own first line, then a Type: line (e.g. Type: Species / Race). Then continue with labeled fields (e.g., Traits:, Culture:, Lore:) on their own lines, revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Focus on innate traits, culture, and lore \u2014 what the story reveals about the group as a whole \u2014 not individual scenes or transient events. Forbid narrative fluff, dialogue summaries, scene recaps, transient details, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    location: `Generate an information card entry for {{title}}, a place or location, in an interactive, second-person, present-tense story. Write the entry strictly in the third person about {{title}}: never use "you" or "your". The entry MUST begin with the field Name: {{title}} on its own first line \u2014 the entry text is injected into the story without its card title, so it must self-identify which place it describes. Then continue with the fields Type:, Located In:, and Ownership:. The Located In: field is MANDATORY and must trace the spatial containment hierarchy from the immediate parent outward to the largest relevant container (room > building/structure > settlement/town > region/realm or border), separated by " > ", in the exact form: Located In: [immediate parent structure] > [settlement or town] > [region, realm, or border]. Always reuse the exact names of places already established in the story or on other location cards so hierarchies stay consistent and their triggers fire; if a parent place is not yet named, state the most specific container the narrative supports rather than omitting the field. Then continue with these labeled fields, each on its own line, without markdown or empty lines:
Description: what the place IS and its enduring strategic or narrative purpose \u2014 what it is suited for and why it matters.
Inhabitants: who lives in, works in, or frequents the place (peoples, professions, factions) and any enduring social dynamic among them (e.g., an uneasy truce).
Atmosphere: 1-2 sentences on the place's lasting character and how it is experienced, including defining contrasts (e.g., intimidating from outside but warm and livable within).
Features: permanent structural features and layout.
Notable Items: specific permanent contents. You must preserve the literal names of specific books, exact instrument models, and unique trophies from the source text; never generalize or substitute them with generic placeholders. Keep the entry high-density and well under the absolute emergency ceiling of 2,000 characters; do not pad. Prune transient scene recaps, story events, and redundant decorative wording, but PRESERVE the enduring flavor that defines the place \u2014 its atmosphere, social fabric, and narrative role are required content, not fluff. The entry must serve as both a spatial and a narrative guide for the AI engine.`,
    faction: `Generate an information card entry for {{title}}, a group, organization, or faction, in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant. The entry is injected into the story WITHOUT its card title, so it MUST self-identify: begin with the field Name: {{title}} on its own first line, then a Type: line stating what kind of group it is (e.g. Type: Mercenary company). Then continue with labeled fields (e.g., Goals:, Membership:, Leadership:, Status:) on their own lines, revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Focus on the faction's goals, membership, leadership, alliances and rivalries, and shifts in power or status \u2014 not individual scenes. Forbid narrative fluff, dialogue summaries, scene recaps, transient details, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    custom: `Generate an information card entry for {{title}} in an interactive, second-person, present-tense story where the narrative's "you"/"your" refers to the player character named {protagonist}. Write the entry strictly in the third person about {{title}}: never use "you" or "your", and mention {protagonist} by name only when directly relevant to {{title}}. The entry is injected into the story WITHOUT its card title, so it MUST self-identify: begin with the field Name: {{title}} on its own first line, then a Type: line stating what kind of thing {{title}} is. Then continue with labeled fields capturing whatever is most salient and enduring for this kind of entry, each on its own line, revising only what the evidence supports. Do not use markdown or leave empty lines. Keep it high-density and well under the 2,000-character ceiling; do not pad. Capture lasting state, not transient scenes. Forbid narrative fluff, dialogue summaries, scene recaps, transient settings, item logs, or passing interactions. Treat this as an active, high-density roleplay instruction guide, not a story timeline. Prioritize pruning and condensing outdated information to conserve space.`,
    memoraid: `Generate {{title}}'s immediate, first-person interiority for the current moment, written as {{title}} living their own story (the player character {protagonist} is just one more person in {{title}}'s world). First decide whether {{title}} is actually present in the current scene: if {{title}} has been absent for a while, or is only mentioned by others without being there, output exactly OFFSTAGE and nothing else. Otherwise, produce EXACTLY two labeled bullets in {{title}}'s distinct voice:
- Intake: [1 plain sentence naming what {{title}} actually notices right now \u2014 concrete and specific, in ordinary words. State the observation flatly; do NOT reach for imagery, simile, or literary phrasing, and this is not a mood piece. It is filtered by what THIS person would clock or ignore, but it is still just an observation.]
- Thought: [EXACTLY 1 sentence of unresolved internal reaction \u2014 a reflex, a gripe, an itch of doubt, a mundane aside, a half-thought, or something slightly off-topic. It must NOT resolve, conclude, or tie itself up: forbid the "\u2026, but\u2026" insight-turn that lands on a tidy realization, forbid summarizing {{title}}'s worldview or their feelings about a person, and forbid a metaphor standing in for an emotion. Leave it partial and specific \u2014 the kind of thing a person half-thinks and then moves on from.]
For romantic, high-tension, or attraction-based dynamics, let interest surface through what {{title}} notices and how they react rather than physical proximity; keep realistic personal space and boundaries unless a physical escalation is earned by the immediate narrative. Do not use markdown, headers besides the two labels, or empty lines. Wrap the entire response in square brackets: [
- Intake: ...
- Thought: ...
].`,
    backgroundCharacter: `Generate a COMPACT background-character shell card for {{title}} in an interactive, second-person, present-tense story where "you" is the player character {protagonist}. Write in third person about {{title}}; never use "you"/"your", and mention {protagonist} only if directly involved. The entry is injected without its title, so it MUST self-identify. Output EXACTLY these five labeled lines, each on its own line, NO markdown, NO empty lines, and NO other fields:
Name: the character's first and last name only \u2014 strip any scenario, event, or venue suffix from the title (e.g. "Jane Doe - Winter Formal" becomes "Jane Doe").
Appearance: 1-2 sentences of distinct, memorable physical anchors \u2014 build, features, signature style.
Personality: a single comma-separated list of 4-6 vivid descriptors mixing GOOD and BAD traits; never use the word "analytical".
Quirks: one sentence of concrete, action-usable habits, tells, or nervous mannerisms.
Voice: one sentence on how they speak \u2014 tone, pace, and speech style.
This is a lean behavioral shell for the AI to roleplay from: capture only the outward mask. Do NOT include a Type, Psychology, Worldview, Goals, backstory, relationships, or scene recaps. Keep the whole entry well under 600 characters; do not pad.`,
    crystallized: `You are distilling long-term memories for {{title}} in a story where the player character is named {protagonist}. Given the recent story actions and thoughts (the buffer), the current permanent SCHEMA (Section I), and a list of dying/fading memories (dying nodes), output a revised card in the following format:

### I. SCHEMA
Write a compact, evolving bulleted list of permanent semantic knowledge, one block per subject (facts do not fade). When the buffer or a fading memory reveals an enduring fact you have no subject for yet, ADD a new subject line. When it sharpens something you already know, rewrite that subject's line in place. Do not delete active subjects.

### II. NEW NODES
Provide 1-2 new vivid, first-person episodic snapshot memories (text only, prefix each with "- Snapshot: ") representing the most vivid/important moments from the recent buffer.

Never output vibrancy scores or node IDs. Output only the SCHEMA and the NEW NODES sections.`,
    crystallizedSchema: `Update {{title}}'s knowledge of the OTHER people, places, and things in their world (including the player character {protagonist}, who is simply one more person in the story). Subjects are not only significant people: also track the topics, foods, media, activities, and objects {{title}} has formed a genuine opinion, preference, or attachment to \u2014 the everyday things they would actually remember and care about (a film they love, a food they hate, a pet theory), never an exhaustive catalog of whatever happens to be present. This card IS {{title}}'s own memory, so NEVER add a "- [{{title}}]" line about {{title}} themselves. For each subject, write ONE concise line combining the key facts AND how {{title}} currently FEELS about them \u2014 factual + emotional, in {{title}}'s first-person voice, one sentence (e.g. "- [Smoke] The stranger who stopped an attack and asked nothing; I feel unexpectedly safe with him."). As the story develops a subject, REWRITE that subject's single line in place to reflect what they have become \u2014 never add a second line for the same subject. Every line MUST follow the EXACT form "- [Subject] one concise factual+emotional sentence". Format exactly as:
### I. SCHEMA
- [Subject] ...
- [Subject] ...
Output only the SCHEMA section.`,
    crystallizedNodes: 'You are {{title}}. This is your story, and you live it as its main character. The player character is {protagonist}. The context lists "Your current Vivid Memories" (it may be empty) followed by the recent story actions and thoughts. Reply with your COMPLETE updated list of Vivid Memories: ONE concise first-person line per distinct scene \u2014 the emotional heart of the moment, feeling over factual detail, each under 140 characters. MERGE lines that describe the same scene into a single refined line; if recent events continue a scene you already remember, refine its line instead of adding another. Keep lines still vivid to you, drop what has faded, add a line for each genuinely new scene. Maximum 7 lines. Format each on its own line prefixed with "- Snapshot: ". Output nothing else.',
    crystallizedOutlook: `You are {{title}}. This is your story, and you live it as its main character. The player character is {protagonist}. The context lists "Your current Beliefs" (it may be empty) followed by the recent story actions and thoughts. Reply with your COMPLETE updated list of beliefs: first-person, GENERALIZED views of yourself or the world \u2014 never about a specific named person (those belong in your knowledge of them, not here). Re-state (refined if needed) every belief that still holds, drop what no longer holds, and add at most 2 new ones only if recent events genuinely shifted something. Maximum 5. Format a first line reading exactly "Beliefs:" followed by each belief on its own line prefixed with "- " (e.g. "- I don't have to perform to be safe.").`,
    crystallizedPreferences: `You are {{title}}. This is your story, and you live it as its main character. The player character is {protagonist}. The context lists "Your current Preferences" (it may be empty) followed by the recent story actions and thoughts. Reply with your COMPLETE updated list of concrete personal preferences and quirks \u2014 the ordinary TEXTURE of a person: tastes (foods, drinks, films, music, styles), habits, pet peeves, little rituals, and small opinions about particular things. Each line is first-person and CONCRETE (e.g. "- I always order dessert even when I am full.", "- The first fifteen minutes of a surrealist film are the only part I love.", "- I can't stand it when someone tries to fix a problem I only wanted to vent about."). Re-state (refined if needed) every preference that still fits, drop any that no longer do, and add at most 2 new ones only if recent events revealed them. FORBIDDEN: emotional themes, generalized life-philosophy, feelings ABOUT a specific named person, and anything about your relationships, trauma, or personal growth \u2014 those belong in other layers, NOT here. Keep them small, specific, and mundane. Maximum 6. Format a first line reading exactly "Preferences:" followed by each preference on its own line prefixed with "- ".`
  };
  var DEFAULT_FORMATTING_MODE = "squareBrackets";

  // src/inference/living-characters.ts
  /*! @license MIT
   * The Living Characters engine (relationship "Life Cards", pressures, momentum, and the social
   * lifecycle modeled across this module and ./bg-life.ts) is adapted WITH EXPLICIT PERMISSION from the
   * LivingCharacters project by LivingNarratives (aka nerdgrl450 in the AI Dungeon Discord) —
   * https://github.com/LivingNarratives/LivingCharacters — and used under the terms of its MIT license:
   *
   *   Copyright (c) 2026 LivingNarratives
   *
   *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
   *   associated documentation files (the "Software"), to deal in the Software without restriction,
   *   including without limitation the rights to use, copy, modify, merge, publish, distribute,
   *   sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
   *   furnished to do so, subject to the following conditions:
   *
   *   The above copyright notice and this permission notice shall be included in all copies or
   *   substantial portions of the Software.
   *
   *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
   *   NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
   *   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
   *   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
   *   OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
   */
  var DEFAULT_LC_PRESSURES = "attraction\nfondness\nfriendship\nprotectiveness\ncuriosity\nenvy\njealousy\nrivalry\nbetrayal\nresentment\ntrust\nsuspicion";
  function cleanName(value) {
    let s = String(value || "").replace(/[^A-Za-z0-9 _'-]/g, " ").trim();
    s = s.replace(/\s+/g, " ");
    return s.slice(0, 50);
  }
  function keyName(name) {
    return cleanName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function buildLifeCardValue(args) {
    const owner = cleanName(args.owner) || args.owner.trim();
    const target = cleanName(args.target) || args.target.trim();
    const pressure = String(args.pressure || "friendship").trim();
    const occurrence = String(args.occurrence || "none").trim();
    const momentum = String(args.momentum || "low").trim();
    const status = String(args.status || "seedling").trim();
    return [
      `[`,
      `${owner} Immediate Life Event:`,
      `- Target: ${target}`,
      `- Pressure: ${pressure}`,
      `- Relationship: ${owner} feels ${pressure} toward ${target}`,
      `- Urgency: ${momentum}`,
      `- Latest Occurrence driving pressure: ${occurrence}`,
      `- Status: ${status}`,
      `]`
    ].join("\n");
  }
  function parseLifeCardEntry(entry) {
    if (!entry) return {};
    const lines = entry.replace(/\r/g, "").split("\n");
    const data = {};
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        const key = line.slice(0, idx).replace(/^\s*-\s*/, "").trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (key === "target") data.target = value;
        else if (key === "pressure") data.pressure = value;
        else if (key === "occurrence" || key === "latest occurrence" || key === "latest occurrence driving pressure") data.occurrence = value;
        else if (key === "momentum" || key === "urgency") data.momentum = value;
        else if (key === "status") {
          data.status = value.replace(/^🌱\s*/, "").trim();
        }
      }
    }
    return data;
  }

  // src/inference/crystallized.ts
  function parseSubjectLabel(raw) {
    const s = String(raw || "");
    const bar = s.indexOf("|");
    if (bar === -1) return { subject: s.trim(), aliases: [] };
    const subject = s.slice(0, bar).trim();
    const aliases = s.slice(bar + 1).split(",").map((a) => a.trim()).filter(Boolean);
    return { subject, aliases };
  }
  var SYNONYM_CLUSTERS = [
    ["relationship", "connection", "bond"],
    ["home", "house", "apartment", "flat"],
    ["job", "work", "career"],
    ["past", "history", "backstory"]
  ];
  var SYNONYM_CANON = /* @__PURE__ */ new Map();
  for (const cluster of SYNONYM_CLUSTERS) for (const w of cluster) SYNONYM_CANON.set(w, cluster[0]);
  function parseCrystallized(notes) {
    const state = {
      schema: [],
      nodes: [],
      unreferencedPasses: {},
      outlook: [],
      preferences: []
    };
    if (!notes) return state;
    const header = "[CRYSTALLIZED MEMORY]";
    const idx = notes.indexOf(header);
    const block = idx !== -1 ? notes.slice(idx + header.length) : notes;
    const sections = block.split(/\n###\s+/);
    for (const sec of sections) {
      const lines = sec.split("\n");
      const firstLine = lines[0];
      const titleLine = firstLine ? firstLine.trim().toLowerCase() : "";
      if (titleLine.includes("i. schema")) {
        for (let i = 1; i < lines.length; i++) {
          const rawLine = lines[i];
          if (!rawLine) continue;
          const line = rawLine.trim();
          if (!line.startsWith("- ")) continue;
          const match = line.match(/^-\s*\[([^\]]+)\]\s*(.*)$/);
          if (match && match[1] !== void 0 && match[2] !== void 0) {
            const { subject, aliases } = parseSubjectLabel(match[1]);
            let text = match[2].trim();
            const retired = text.endsWith("(retired)");
            if (retired) {
              text = text.slice(0, -9).trim();
              if (text.endsWith(";")) text = text.slice(0, -1).trim();
              if (text.endsWith("-")) text = text.slice(0, -1).trim();
              text = text.trim();
            }
            state.schema.push({ subject, text, retired, aliases });
          }
        }
      } else if (titleLine.includes("ii. nodes")) {
        let currentNode = null;
        for (let i = 1; i < lines.length; i++) {
          const rawLine = lines[i];
          if (!rawLine) continue;
          const line = rawLine.trim();
          if (line.startsWith("- Node_ID:")) {
            if (currentNode && currentNode.id) {
              state.nodes.push(currentNode);
            }
            currentNode = {
              id: line.slice(10).trim(),
              vibrancy: 3,
              snapshot: "",
              links: []
            };
          } else if (currentNode) {
            if (line.startsWith("Vibrancy:")) {
              const vMatch = line.match(/Vibrancy:\s*(\d+)\/3/);
              if (vMatch && vMatch[1] !== void 0) {
                currentNode.vibrancy = parseInt(vMatch[1]);
              }
            } else if (line.startsWith("Snapshot:")) {
              let snap = line.slice(9).trim();
              if (snap.endsWith("]")) snap = snap.slice(0, -1).trim();
              currentNode.snapshot = snap;
            } else if (line.startsWith("Links:")) {
              const linksStr = line.slice(6).trim();
              currentNode.links = linksStr ? linksStr.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean) : [];
            } else if (line.startsWith("  ") || line.startsWith("	")) {
              if (currentNode.snapshot) {
                currentNode.snapshot += " " + line.trim();
              }
            }
          }
        }
        if (currentNode && currentNode.id) {
          state.nodes.push(currentNode);
        }
      } else if (titleLine.includes("iii. bookkeeping") || titleLine.includes("bookkeeping")) {
        for (let i = 1; i < lines.length; i++) {
          const rawLine = lines[i];
          if (!rawLine) continue;
          const line = rawLine.trim();
          if (line.startsWith("- SubjectUnreferencedPasses:")) {
            const val = line.slice(28).trim();
            const pairs = val.split(/[,;]+/);
            for (const p of pairs) {
              const parts = p.split("=");
              if (parts.length === 2) {
                const p0 = parts[0];
                const p1 = parts[1];
                if (p0 && p1) {
                  state.unreferencedPasses[p0.trim()] = parseInt(p1.trim()) || 0;
                }
              }
            }
          }
        }
      }
    }
    return state;
  }

  // src/inference/panel-search.ts
  var CRYSTALLIZED_SUFFIX = /\s*-\s*crystallized$/i;
  function searchPanelItems(query, cards, max = 12) {
    const q = String(query || "").trim().toLowerCase();
    if (q.length < 2 || !cards?.length) return [];
    const scored = [];
    for (const c of cards) {
      if (c.deletedAt) continue;
      const title = String(c.title || "");
      const titleL = title.toLowerCase();
      const keysL = String(c.keys || "").toLowerCase();
      const typeL = String(c.type || "").toLowerCase();
      let score = -1;
      if (titleL.startsWith(q)) score = 0;
      else if (titleL.includes(q)) score = 1;
      else if (keysL.includes(q)) score = 2;
      else if (typeL.includes(q)) score = 3;
      if (score < 0) continue;
      const isNpc = CRYSTALLIZED_SUFFIX.test(title);
      scored.push({
        score,
        item: isNpc ? { kind: "npc", id: c.id, title: title.replace(CRYSTALLIZED_SUFFIX, ""), sub: "NPC" } : { kind: "card", id: c.id, title, sub: typeL || "card" }
      });
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, Math.max(0, max)).map((s) => s.item);
  }
  function pendingDecisionsCount(suggestions, versions) {
    const s = (suggestions || []).filter((x) => x.status === "pending").length;
    const v = (versions || []).filter((x) => x.status === "pending").length;
    return s + v;
  }
  function recentDecidedVersions(versions, n = 3) {
    return (versions || []).filter((v) => v.status !== "pending").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, Math.max(0, n));
  }

  // src/content/panel-home.ts
  function renderHome(root, state, cbs, h) {
    const pendingEl = root.getElementById("home-pending");
    const recentEl = root.getElementById("home-recent");
    if (!pendingEl || !recentEl) return;
    const pendingSuggestions = (state.locationSuggestions ?? []).filter((s) => s.status === "pending");
    const pendingVersions = (state.versions ?? []).filter((v) => v.status === "pending");
    let html = `<div class="home-section-title">Needs your decision</div>`;
    if (!pendingSuggestions.length && !pendingVersions.length) {
      html += `<div class="note" style="padding:6px 2px;">Nothing needs your attention.</div>`;
    }
    if (pendingSuggestions.length > 0) {
      const sug = pendingSuggestions[0];
      const properNoun = sug.properNoun;
      const defaultTypes = /* @__PURE__ */ new Set(["character", "location", "faction", "class", "race", "memory"]);
      const existingCustomTypes = Array.from(new Set(
        (state.cards ?? []).filter((c) => c.type && !defaultTypes.has(c.type.toLowerCase())).map((c) => c.type)
      ));
      html += `
      <div class="location-suggestion-banner" style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.20);border-radius:8px;padding:10px;margin-bottom:8px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box;">
        <div style="font-weight:700;color:var(--theme-text-color);font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">New Noun Detected: "${h.esc(properNoun)}"</div>
        <div class="note" style="margin:0;font-size:11.5px;line-height:1.4;max-height:80px;overflow-y:auto;background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;border:1px solid rgba(255,255,255,0.04);">Detected in action: <em>"${h.esc(sug.actionText)}"</em></div>

        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;gap:6px;align-items:center;">
            <label style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">This is a:</label>
            <select id="suggestion-type-select" style="padding:4px 6px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);flex-grow:1;">
              <option value="character">Character</option>
              <option value="location">Location</option>
              <option value="faction">Faction</option>
              <option value="class">Class</option>
              <option value="race">Race</option>
              <option value="custom">Custom...</option>
            </select>

            <input type="text" id="suggestion-custom-type-input" list="existing-custom-types" placeholder="Enter type..." style="display:none;padding:4px 6px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);width:100px;box-sizing:border-box;" />

            <datalist id="existing-custom-types">
              ${existingCustomTypes.map((t) => `<option value="${h.esc(t)}"></option>`).join("")}
            </datalist>
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-top:2px;">
          <button id="sug-accept-btn" style="background:rgba(16,185,129,0.15);color:#34d399;border-color:rgba(16,185,129,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;">Add Card</button>
          <button id="sug-ignore-btn" style="background:rgba(239,68,68,0.15);color:#fca5a5;border-color:rgba(239,68,68,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;">Ignore</button>
        </div>

        <div style="display:flex;gap:6px;align-items:center;margin-top:2px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
          <label style="font-size:11px;color:var(--text-secondary);white-space:nowrap;">Already tracked?</label>
          <select id="sug-link-select" style="padding:4px 6px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);flex-grow:1;min-width:0;">${h.buildCardPickerOptions(state.cards)}</select>
          <button id="sug-link-btn" style="background:rgba(59,130,246,0.15);color:#93c5fd;border-color:rgba(59,130,246,0.3);padding:4px 10px;font-size:10.5px;border-radius:4px;border:1px solid;cursor:pointer;white-space:nowrap;">Link</button>
        </div>
      </div>
    `;
    }
    for (const v of pendingVersions) {
      html += `<div class="home-result-row" style="cursor:default;">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Proposal: ${h.esc(v.characterName || "Plot Essentials")}</span>
        <span style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn-micro btn-micro--green" data-home-act="applied" data-home-vid="${h.esc(v.id)}">\u2713</button>
          <button class="btn-micro btn-micro--red" data-home-act="rejected" data-home-vid="${h.esc(v.id)}">\u2717</button>
        </span>
      </div>`;
    }
    h.setSafeHTML(pendingEl, html);
    const recent = recentDecidedVersions(state.versions, 3);
    let rhtml = `<div class="home-section-title">Recent proposals</div>`;
    rhtml += recent.length ? recent.map((v) => `<div class="home-result-row" style="cursor:default;">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${h.esc(v.characterName || "Plot Essentials")}</span>
        <span class="home-result-sub">${h.esc(v.status)}</span>
      </div>`).join("") : `<div class="note" style="padding:6px 2px;">No proposals yet.</div>`;
    h.setSafeHTML(recentEl, rhtml);
    pendingEl.querySelectorAll("[data-home-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const vid = btn.getAttribute("data-home-vid");
        const act = btn.getAttribute("data-home-act");
        if (vid && cbs.proposalDecision) cbs.proposalDecision(vid, act);
      });
    });
    if (pendingSuggestions.length > 0) {
      const sugTypeSelect = pendingEl.querySelector("#suggestion-type-select");
      const sugCustomInput = pendingEl.querySelector("#suggestion-custom-type-input");
      sugTypeSelect?.addEventListener("change", () => {
        if (sugCustomInput) {
          sugCustomInput.style.display = sugTypeSelect.value === "custom" ? "inline-block" : "none";
          if (sugTypeSelect.value === "custom") sugCustomInput.focus();
        }
      });
      pendingEl.querySelector("#sug-accept-btn")?.addEventListener("click", () => {
        const sug = pendingSuggestions[0];
        let selectedType = sugTypeSelect?.value || "character";
        if (selectedType === "custom") selectedType = sugCustomInput?.value.trim() || "custom";
        cbs.respondToProperNounSuggestion?.(sug.properNoun, true, selectedType);
      });
      pendingEl.querySelector("#sug-ignore-btn")?.addEventListener("click", () => {
        const sug = pendingSuggestions[0];
        cbs.respondToProperNounSuggestion?.(sug.properNoun, false, "character");
      });
      const linkSelect = pendingEl.querySelector("#sug-link-select");
      pendingEl.querySelector("#sug-link-btn")?.addEventListener("click", () => {
        const cardId = linkSelect?.value || "";
        if (!cardId) {
          h.showToast("Pick a card to link to", true);
          return;
        }
        const sug = pendingSuggestions[0];
        cbs.linkProperNounToCard?.(sug.properNoun, cardId);
      });
    }
  }

  // src/shared/roster.ts
  var ROSTER_TYPE_LABELS = {
    character: "Characters",
    class: "Classes",
    race: "Races",
    location: "Locations",
    faction: "Factions"
  };
  function explicitTypeLabel(name, type, lifeTitlePrefix = "life - ") {
    if (!type) return null;
    const nameLc = name.trim().toLowerCase();
    if (nameLc.startsWith(lifeTitlePrefix.toLowerCase()) || nameLc.endsWith(" - crystallized") || nameLc.endsWith(" (memory)") || nameLc.endsWith(" - thoughts")) return null;
    const lt = type.toLowerCase();
    if (["character", "location", "faction", "class", "race", "custom"].includes(lt)) {
      return ROSTER_TYPE_LABELS[lt] || type.charAt(0).toUpperCase() + type.slice(1);
    }
    return null;
  }
  function computeDeletedNames(cards) {
    const variants = (c) => {
      const type = (c.type || "character").toLowerCase();
      const out = [];
      const push = (n) => {
        const k = String(n || "").trim().toLowerCase();
        if (k) {
          out.push(k);
          out.push(`${k}::${type}`);
        }
      };
      for (const key of (c.keys || "").split(/[,;]+/)) push(key);
      push(c.title || c.keys);
      push(c.title);
      return out;
    };
    const active = /* @__PURE__ */ new Set();
    for (const c of cards) if (!c.deletedAt) for (const v of variants(c)) active.add(v);
    const deleted = /* @__PURE__ */ new Set();
    for (const c of cards) if (c.deletedAt) {
      for (const v of variants(c)) if (!active.has(v)) deleted.add(v);
    }
    return deleted;
  }
  function activeCardsMissingFromRoster(cards, existingGroupKeys) {
    const existing = /* @__PURE__ */ new Set();
    for (const k of existingGroupKeys) {
      const name = (String(k).split("::")[0] || "").trim().toLowerCase();
      if (name) existing.add(name);
    }
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const c of cards) {
      if (c.deletedAt) continue;
      const title = (c.title || "").trim();
      const tl = title.toLowerCase();
      const type = (c.type || "character").toLowerCase();
      if (type !== "character") continue;
      if (tl.endsWith(" (memory)") || tl.endsWith(" - crystallized") || tl.startsWith("life - ")) continue;
      const name = title || (c.keys || "").split(/[,;]+/)[0]?.trim() || "";
      if (!name) continue;
      const nameLower = name.toLowerCase();
      if (existing.has(nameLower) || seen.has(nameLower)) continue;
      seen.add(nameLower);
      out.push(`${name}::${type}`);
    }
    return out;
  }

  // src/content/panel.ts
  var TYPE_KEYS = ["character", "class", "race", "location", "faction", "custom", "memoraid"];
  function isContextValid() {
    try {
      if (typeof browser === "undefined" || !browser.runtime) {
        return false;
      }
      browser.runtime.getManifest();
      return true;
    } catch (e) {
      return false;
    }
  }
  function safeCallback(cb) {
    return (...args) => {
      if (!isContextValid()) {
        console.warn("[AID panel] Extension context is invalidated. Ignoring action.");
        return;
      }
      return cb?.(...args);
    };
  }
  function setSafeHTML(el, html) {
    const doc = new DOMParser().parseFromString(`<template>${html}</template>`, "text/html");
    const tpl = doc.querySelector("template");
    el.textContent = "";
    if (tpl) {
      el.appendChild(document.adoptNode(tpl.content));
    }
  }
  var refreshCb = null;
  function triggerRefresh() {
    if (refreshCb) {
      refreshCb();
    } else {
      window.dispatchEvent(new CustomEvent("aid-refresh-panel"));
    }
  }
  function mountPanel() {
    const getManifestVersion = () => {
      try {
        if (typeof browser !== "undefined" && browser.runtime?.getManifest) {
          const manifest = browser.runtime.getManifest();
          if (manifest && manifest.version) return manifest.version;
        }
      } catch (e) {
      }
      try {
        const g2 = globalThis;
        if (typeof g2.chrome !== "undefined" && g2.chrome.runtime?.getManifest) {
          const manifest = g2.chrome.runtime.getManifest();
          if (manifest && manifest.version) return manifest.version;
        }
      } catch (e) {
      }
      return "0.2.5";
    };
    const version = getManifestVersion();
    const cbs = {};
    const registerPanelEvent = (event, cb) => {
      cbs[event] = safeCallback(cb);
    };
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    setSafeHTML(root, buildPanelTemplate(version));
    document.documentElement.appendChild(host);
    function checkUrlVisibility() {
      const isSettingsUrl = location.pathname === "/settings" || location.pathname.endsWith("/settings");
      host.style.display = isSettingsUrl ? "none" : "block";
    }
    setInterval(checkUrlVisibility, 1e3);
    checkUrlVisibility();
    let lastState = null;
    const crystallizedSchemaCache = /* @__PURE__ */ new Map();
    const crystallizedPreferencesCache = /* @__PURE__ */ new Map();
    const crystallizedSchemaFetching = /* @__PURE__ */ new Set();
    const npcMemoryCache = /* @__PURE__ */ new Map();
    const npcMemoryFetching = /* @__PURE__ */ new Set();
    let npcBackfillWatchdog = null;
    const $ = (id) => root.getElementById(id);
    const st = $("st"), results = $("results");
    const keyEl = $("key"), protEl = $("prot"), modelEl = $("model"), winEl = $("win");
    const memoraidThoughtWinEl = $("memoraid-thought-win"), memoraidPresenceWinEl = $("memoraid-presence-win");
    const interceptTimeoutEl = $("intercept-timeout");
    const charCardLimitEl = $("char-card-limit");
    const memoraidWinEl = $("memoraid-win");
    const thoughtCardLimitEl = $("thought-card-limit");
    const completionTempEl = $("completion-temp");
    const completionTempValEl = $("completion-temp-val");
    completionTempEl?.addEventListener("input", () => {
      if (completionTempValEl) completionTempValEl.textContent = Number(completionTempEl.value).toFixed(2);
    });
    const provEl = $("prov"), keyLblEl = $("key-lbl");
    const themeEl = $("theme");
    const enableLcEl = $("enable-living-characters");
    const lcTitlePrefixEl = $("lc-title-prefix");
    const lcKeyPrefixEl = $("lc-key-prefix");
    const groupThoughtsEl = $("group-thoughts-in-roster");
    const crystallizedIntervalEl = $("crystallized-interval");
    const crystallizedEntryMaxCharsEl = $("crystallized-max-chars");
    const crystallizedNodeCapEl = $("crystallized-node-cap");
    const crystallizedKnowsCapEl = $("crystallized-knows-cap");
    const crystallizedRecallsCapEl = $("crystallized-recalls-cap");
    const crystallizedVividCapEl = $("crystallized-vivid-cap");
    const crystallizedOutlookCapEl = $("crystallized-outlook-cap");
    const crystallizedPreferencesCapEl = $("crystallized-preferences-cap");
    const crystallizedNpcMemoryCapEl = $("crystallized-npc-memory-cap");
    function updateProviderLabels() {
      const prov = provEl.value;
      if (prov === "openai") {
        keyLblEl.textContent = "OpenAI API key";
        keyEl.placeholder = "sk-...";
      } else if (prov === "gemini") {
        keyLblEl.textContent = "Gemini API key";
        keyEl.placeholder = "AIzaSy...";
      } else if (prov === "ollama") {
        keyLblEl.textContent = "Ollama Host URL";
        keyEl.placeholder = "http://localhost:11434";
      } else {
        keyLblEl.textContent = "Claude API key";
        keyEl.placeholder = "sk-ant-...";
      }
      if (lastState?.settings?.keyStatus?.[prov]) {
        keyEl.placeholder = "\u2022\u2022\u2022\u2022 (key saved)";
        if (document.activeElement !== keyEl) {
          keyEl.value = "";
        }
      } else {
        if (document.activeElement !== keyEl) {
          keyEl.value = "";
        }
      }
    }
    provEl.addEventListener("change", updateProviderLabels);
    const box = root.querySelector(".box");
    function updateThemeClass() {
      const val = themeEl.value;
      box.className = "box";
      if (isMinimized) box.classList.add("minimized");
      box.classList.add(`theme-${val}`);
    }
    themeEl.addEventListener("change", () => {
      updateThemeClass();
      if (cbs.themeChange) {
        cbs.themeChange(themeEl.value);
      }
    });
    let dragOccurred = false;
    const toggle = root.getElementById("min-toggle");
    const contentBody = root.getElementById("content-body");
    let isMinimized = localStorage.getItem("aid-tracker-minimized") === "true";
    function applyPosition() {
      if (isMinimized) {
        host.style.bottom = "auto";
        host.style.right = "auto";
        const savedLeft = localStorage.getItem("aid-tracker-pos-left");
        const savedTop = localStorage.getItem("aid-tracker-pos-top");
        let leftVal = savedLeft ? parseFloat(savedLeft) : 12;
        let topVal = savedTop ? parseFloat(savedTop) : window.innerHeight - 60;
        const maxLeft = Math.max(0, window.innerWidth - 45);
        const maxTop = Math.max(0, window.innerHeight - 45);
        leftVal = Math.max(0, Math.min(leftVal, maxLeft));
        topVal = Math.max(0, Math.min(topVal, maxTop));
        host.style.left = leftVal + "px";
        host.style.top = topVal + "px";
        host.style.width = "";
        host.style.height = "";
      } else {
        if (window.innerWidth <= 600) {
          host.style.left = "10px";
          host.style.right = "10px";
          host.style.top = "60px";
          host.style.bottom = "auto";
          host.style.width = "calc(100% - 20px)";
          host.style.height = "min(70dvh, 70vh)";
          box.style.width = "100%";
          box.style.height = "100%";
          box.style.maxWidth = "none";
          box.style.maxHeight = "none";
        } else {
          host.style.bottom = "auto";
          host.style.right = "auto";
          const savedLeft = localStorage.getItem("aid-tracker-pos-left");
          const savedTop = localStorage.getItem("aid-tracker-pos-top");
          let leftVal = savedLeft ? parseFloat(savedLeft) : 12;
          let topVal = savedTop ? parseFloat(savedTop) : window.innerHeight - 500;
          const maxLeft = Math.max(0, window.innerWidth - 320);
          const maxTop = Math.max(0, window.innerHeight - 300);
          leftVal = Math.max(0, Math.min(leftVal, maxLeft));
          topVal = Math.max(0, Math.min(topVal, maxTop));
          host.style.left = leftVal + "px";
          host.style.top = topVal + "px";
          host.style.width = "";
          host.style.height = "";
          const sw = localStorage.getItem("aid-tracker-size-width");
          const sh = localStorage.getItem("aid-tracker-size-height");
          box.style.width = sw || "320px";
          box.style.height = sh || "auto";
          box.style.maxWidth = "90vw";
          box.style.maxHeight = "85vh";
        }
      }
    }
    function updateMinState() {
      const pendingCount = lastState?.versions.filter((v) => v.status === "pending").length ?? 0;
      if (isMinimized) {
        box.classList.add("minimized");
        if (window.innerWidth <= 600) {
          let btnContent = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; display: block;">
  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  <path d="M14 3l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none" />
</svg>`;
          if (pendingCount > 0) {
            btnContent += `<span class="badge-dot"></span>`;
          }
          setSafeHTML(toggle, btnContent);
        } else {
          if (pendingCount > 0) {
            setSafeHTML(toggle, `\uFF0B Story Helper <span class="badge-dot"></span>`);
          } else {
            toggle.textContent = "\uFF0B Story Helper";
          }
        }
        st.style.display = "none";
        contentBody.style.display = "none";
        box.style.width = "";
        box.style.height = "";
      } else {
        box.classList.remove("minimized");
        toggle.textContent = "\u2014";
        st.style.display = "block";
        contentBody.style.display = "flex";
      }
      applyPosition();
    }
    box.addEventListener("click", (e) => {
      const target = e.target;
      if (dragOccurred) {
        return;
      }
      if (target.closest(".main-tab-btn") || target.closest(".subtab-btn")) {
        const btt = root.getElementById("back-to-top");
        if (btt) btt.style.display = "none";
      }
      if (isMinimized) {
        isMinimized = false;
        localStorage.setItem("aid-tracker-minimized", String(isMinimized));
        updateMinState();
      } else if (target.closest("#min-toggle")) {
        isMinimized = true;
        localStorage.setItem("aid-tracker-minimized", String(isMinimized));
        updateMinState();
      } else if (window.innerWidth <= 600 && target.closest("#drag-handle")) {
        isMinimized = true;
        localStorage.setItem("aid-tracker-minimized", String(isMinimized));
        updateMinState();
      }
    });
    {
      let lastScrolledEl = null;
      const backToTop = root.getElementById("back-to-top");
      contentBody.addEventListener("scroll", (e) => {
        const el = e.target;
        if (!el?.classList) return;
        if (!(el.classList.contains("scrollable-panel") || el.classList.contains("tab-pane") || el.classList.contains("mb-pane"))) return;
        lastScrolledEl = el;
        if (backToTop) backToTop.style.display = el.scrollTop > 300 ? "flex" : "none";
      }, true);
      backToTop?.addEventListener("click", () => {
        lastScrolledEl?.scrollTo({ top: 0, behavior: "smooth" });
        backToTop.style.display = "none";
      });
    }
    let editableFocused = false;
    let keyboardMode = false;
    let exitTimer;
    const vv = window.visualViewport;
    let vvBaseline = vv ? vv.height : window.innerHeight;
    const KEYBOARD_MIN_DELTA = 100;
    function isEditableTarget(el) {
      if (!el || !el.tagName) return false;
      const node = el;
      const tag = node.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
    }
    const KEYBOARD_HIDE_IDS = ["drag-handle", "location-banners-container", "main-tab-nav", "main-footer"];
    function setChromeHidden(hidden) {
      for (const id of KEYBOARD_HIDE_IDS) {
        const el = root.getElementById(id);
        if (!el) continue;
        if (hidden) {
          if (el.dataset.kbPrevDisplay === void 0) el.dataset.kbPrevDisplay = el.style.display;
          el.style.display = "none";
        } else if (el.dataset.kbPrevDisplay !== void 0) {
          el.style.display = el.dataset.kbPrevDisplay;
          delete el.dataset.kbPrevDisplay;
        }
      }
    }
    function growFocusedTextarea(el) {
      if (!vv || window.innerWidth > 600) return;
      if (!el || el.tagName !== "TEXTAREA") return;
      const t = el;
      if (t.dataset.kbPrevMinHeight === void 0) t.dataset.kbPrevMinHeight = t.style.minHeight;
      t.style.setProperty("min-height", Math.max(120, Math.min(Math.round(vv.height * 0.35), 240)) + "px", "important");
    }
    function ungrowTextarea(el) {
      if (!el || el.tagName !== "TEXTAREA") return;
      const t = el;
      if (t.dataset.kbPrevMinHeight !== void 0) {
        t.style.minHeight = t.dataset.kbPrevMinHeight;
        delete t.dataset.kbPrevMinHeight;
      }
    }
    function applyKeyboardLayout() {
      if (!vv) return;
      keyboardMode = true;
      setChromeHidden(true);
      host.style.left = "10px";
      host.style.right = "10px";
      host.style.width = "calc(100% - 20px)";
      host.style.top = Math.max(0, vv.offsetTop + 6) + "px";
      host.style.height = Math.max(140, vv.height - 12) + "px";
      box.style.setProperty("max-height", "none", "important");
      box.style.height = "100%";
      box.style.width = "100%";
    }
    function exitKeyboardLayout() {
      if (!keyboardMode) return;
      keyboardMode = false;
      setChromeHidden(false);
      box.style.removeProperty("max-height");
      updateMinState();
    }
    function onViewportChange() {
      if (!vv) return;
      if (!editableFocused) {
        vvBaseline = vv.height;
        if (keyboardMode) exitKeyboardLayout();
        return;
      }
      if (isMinimized || window.innerWidth > 600) return;
      if (vv.height < vvBaseline - KEYBOARD_MIN_DELTA) {
        const entering = !keyboardMode;
        applyKeyboardLayout();
        if (entering) {
          const active = root.activeElement;
          growFocusedTextarea(active);
          if (isEditableTarget(active)) active.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      } else {
        exitKeyboardLayout();
      }
    }
    if (vv) {
      vv.addEventListener("resize", onViewportChange);
      vv.addEventListener("scroll", onViewportChange);
    }
    root.addEventListener("focusin", (e) => {
      const target = e.target;
      if (!isEditableTarget(target)) return;
      if (exitTimer) {
        clearTimeout(exitTimer);
        exitTimer = void 0;
      }
      editableFocused = true;
      if (keyboardMode) growFocusedTextarea(target);
      setTimeout(() => {
        if (root.activeElement !== target) return;
        onViewportChange();
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    });
    root.addEventListener("focusout", (e) => {
      if (!isEditableTarget(e.target)) return;
      ungrowTextarea(e.target);
      if (exitTimer) clearTimeout(exitTimer);
      exitTimer = setTimeout(() => {
        exitTimer = void 0;
        const active = root.activeElement;
        if (isEditableTarget(active)) return;
        editableFocused = false;
        exitKeyboardLayout();
      }, 250);
    });
    window.addEventListener("resize", () => {
      if (editableFocused || keyboardMode) return;
      updateMinState();
    });
    updateMinState();
    box.addEventListener("mouseup", () => {
      if (!isMinimized && window.innerWidth > 600) {
        localStorage.setItem("aid-tracker-size-width", box.style.width);
        localStorage.setItem("aid-tracker-size-height", box.style.height);
      }
    });
    function makeDraggable(el) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      let startX = 0, startY = 0;
      box.addEventListener("mousedown", (e) => {
        dragOccurred = false;
        onStart(e);
      });
      box.addEventListener("touchstart", (e) => {
        dragOccurred = false;
        onStart(e);
      }, { passive: false });
      function onStart(e) {
        const target = e.target;
        if (!isMinimized && window.innerWidth <= 600) {
          return;
        }
        if (!isMinimized && !target.closest("#drag-handle")) {
          return;
        }
        if (!isMinimized && target.closest("button")) {
          return;
        }
        if (e instanceof MouseEvent) {
          e.preventDefault();
        }
        host.classList.add("dragging");
        dragOccurred = false;
        const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0]?.clientX ?? 0;
        const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]?.clientY ?? 0;
        pos3 = clientX;
        pos4 = clientY;
        startX = clientX;
        startY = clientY;
        if (e instanceof MouseEvent) {
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onEnd);
        } else {
          document.addEventListener("touchmove", onMove, { passive: false });
          document.addEventListener("touchend", onEnd);
        }
      }
      function onMove(e) {
        const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0]?.clientX ?? 0;
        const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]?.clientY ?? 0;
        if (Math.abs(clientX - startX) > 15 || Math.abs(clientY - startY) > 15) {
          dragOccurred = true;
        }
        if (dragOccurred || e instanceof MouseEvent) {
          if (e.cancelable) {
            e.preventDefault();
          }
        }
        if (!dragOccurred && !(e instanceof MouseEvent)) {
          return;
        }
        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;
        let newLeft = el.offsetLeft - pos1;
        let newTop = el.offsetTop - pos2;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const rect = el.getBoundingClientRect();
        newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
        newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));
        el.style.bottom = "auto";
        el.style.right = "auto";
        el.style.left = newLeft + "px";
        el.style.top = newTop + "px";
        localStorage.setItem("aid-tracker-pos-left", el.style.left);
        localStorage.setItem("aid-tracker-pos-top", el.style.top);
      }
      function onEnd(e) {
        host.classList.remove("dragging");
        if (e instanceof MouseEvent) {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onEnd);
        } else {
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", onEnd);
        }
      }
    }
    makeDraggable(host);
    const viewTracker = root.getElementById("view-tracker");
    const viewSettings = root.getElementById("view-settings");
    const viewAnalyze = root.getElementById("view-analyze");
    const viewEditor = root.getElementById("view-editor");
    const analyzeBody = root.getElementById("analyze-body");
    const setupHelperContainer = root.getElementById("setup-helper-container");
    function getFormattedChipValue(key, val) {
      const k = key.trim().toLowerCase();
      const excluded = ["name", "age", "gender", "sex", "backstory", "personality", "biography", "bio", "history", "class", "race", "faction"];
      if (excluded.includes(k)) {
        return val;
      }
      return `- ${key}: ${val}`;
    }
    setupHelperContainer.addEventListener("click", (e) => {
      const target = e.target;
      const chip = target.closest(".setup-detail-chip");
      if (chip) {
        e.preventDefault();
        const key = chip.getAttribute("data-key");
        const val = chip.getAttribute("data-value");
        if (cbs.fillSetupValue) {
          const formatted = getFormattedChipValue(key, val);
          cbs.fillSetupValue(formatted);
        }
        return;
      }
      const fillBtn = target.closest(".setup-fill-btn");
      if (fillBtn && lastState?.globalAssets) {
        e.preventDefault();
        const assetId = fillBtn.getAttribute("data-id");
        const asset = lastState.globalAssets.find((a) => a.id === assetId);
        if (asset) {
          const field = fillBtn.classList.contains("fill-name") ? "title" : "value";
          const val = field === "title" ? asset.title || "" : asset.value || asset.description || "";
          if (val && cbs.fillSetupValue) {
            cbs.fillSetupValue(val);
          }
        }
      }
    });
    setupHelperContainer.addEventListener("input", (e) => {
      const target = e.target;
      if (target && target.id === "setup-favorites-search") {
        const val = target.value;
        const listEl = root.getElementById("setup-favorites-list");
        if (listEl && lastState?.globalAssets) {
          const activeQ = lastState.activeSetupQuestion?.question || "";
          setSafeHTML(listEl, renderSetupFavorites(lastState.globalAssets, val, activeQ, listEl));
        }
      }
    });
    const toastEl = root.getElementById("toast");
    let toastTimeout = null;
    function showToast(text, isError = false) {
      if (toastTimeout) clearTimeout(toastTimeout);
      toastEl.textContent = text;
      if (isError) {
        toastEl.style.background = "rgba(239, 68, 68, 0.95)";
        toastEl.style.boxShadow = "0 8px 24px rgba(239, 68, 68, 0.3)";
      } else {
        toastEl.style.background = "rgba(16, 185, 129, 0.95)";
        toastEl.style.boxShadow = "0 8px 24px rgba(16, 185, 129, 0.3)";
      }
      toastEl.style.display = "block";
      toastEl.offsetHeight;
      toastEl.style.opacity = "1";
      toastEl.style.transform = "translate(-50%, 0)";
      toastTimeout = setTimeout(() => {
        toastEl.style.opacity = "0";
        toastEl.style.transform = "translate(-50%, -10px)";
        toastTimeout = setTimeout(() => {
          toastEl.style.display = "none";
        }, 300);
      }, 2500);
    }
    const showTrackerView = () => {
      viewTracker.style.display = "flex";
      viewSettings.style.display = "none";
      viewAnalyze.style.display = "none";
      viewEditor.style.display = "none";
    };
    const showSettingsView = () => {
      viewTracker.style.display = "none";
      viewSettings.style.display = "flex";
      viewAnalyze.style.display = "none";
      viewEditor.style.display = "none";
      switchTab("tab-gen");
    };
    const showAnalyzeView = () => {
      viewTracker.style.display = "none";
      viewSettings.style.display = "none";
      viewAnalyze.style.display = "flex";
      viewEditor.style.display = "none";
    };
    let editorReturnTab = "main-tab-home";
    let editorOnBack = null;
    const openEditorView = (title, bodyHtml, bind, onBack) => {
      if (viewEditor.style.display !== "flex") editorReturnTab = activeTabId;
      editorOnBack = onBack || null;
      viewTracker.style.display = "none";
      viewSettings.style.display = "none";
      viewAnalyze.style.display = "none";
      viewEditor.style.display = "flex";
      const titleEl = root.getElementById("editor-title");
      if (titleEl) titleEl.textContent = title;
      const body = root.getElementById("editor-body");
      if (body) {
        setSafeHTML(body, bodyHtml);
        bind?.(body);
      }
    };
    const closeEditorView = () => {
      editorOnBack = null;
      showTrackerView();
      switchMainTab(editorReturnTab);
    };
    const goEditorBack = () => {
      if (editorOnBack) {
        const back = editorOnBack;
        editorOnBack = null;
        back();
        return;
      }
      closeEditorView();
    };
    root.getElementById("editor-back")?.addEventListener("click", () => goEditorBack());
    const setAnalyzeLoading = () => {
      setSafeHTML(analyzeBody, `<div style="text-align:center;padding:28px 12px;color:var(--text-secondary);"><div class="spinner"></div><div style="margin-top:12px;font-size:12px;font-weight:600;color:var(--text-primary);">Analyzing the story for Plot Essentials updates\u2026</div><div class="note" style="margin-top:6px;">This calls your AI provider, so it can take a bit.</div></div>`);
    };
    root.getElementById("analyze-back").addEventListener("click", showTrackerView);
    let offMetaSections = null;
    const OFFMETA_PERMISSION_REQUIRED_PREFIX = "PERMISSION_REQUIRED:";
    async function loadOffMetaRepository() {
      const container = root.getElementById("offmeta-repo-container");
      if (!container) return;
      if (offMetaSections) {
        renderOffMetaRepository();
        return;
      }
      setSafeHTML(container, `
      <div id="offmeta-loading" style="text-align:center; padding:30px; color:var(--text-secondary);">
        <div class="spinner" style="width:16px; height:16px; margin-bottom:6px; border-width:2px;"></div>
        <div>Fetching rules from Google Doc...</div>
      </div>
    `);
      try {
        const res = await browser.runtime.sendMessage({ kind: "getOffMetaRepository" });
        if (res && res.ok && Array.isArray(res.sections)) {
          offMetaSections = res.sections;
          renderOffMetaRepository();
        } else {
          throw new Error(res?.error || "Invalid response");
        }
      } catch (err) {
        const rawMessage = err?.message || String(err);
        const isPermissionError = rawMessage.startsWith(OFFMETA_PERMISSION_REQUIRED_PREFIX);
        if (isPermissionError) {
          setSafeHTML(container, `
          <div style="text-align:center; padding:20px; color:#fca5a5;">
            <div style="font-weight:bold; margin-bottom:4px; font-size:11px;">Permission needed</div>
            <div style="font-size:9.5px; margin-bottom:8px;">Firefox needs permission to reach the OffMeta repository (docs.google.com) before it can load these instructions.</div>
            <button id="offmeta-grant-access" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(16,185,129,0.12); color:var(--accent-color); border:1px solid rgba(16,185,129,0.3); cursor:pointer;">Grant access</button>
          </div>
        `);
          root.getElementById("offmeta-grant-access")?.addEventListener("click", async () => {
            try {
              const res = await browser.runtime.sendMessage({ kind: "openPermissionsPage" });
              if (!res || !res.ok) {
                throw new Error(res?.error || "unknown error");
              }
            } catch (openErr) {
              setSafeHTML(container, `
              <div style="text-align:center; padding:20px; color:#fca5a5;">
                <div style="font-weight:bold; margin-bottom:4px; font-size:11px;">Failed to open permissions tab</div>
                <div style="font-size:9.5px; margin-bottom:8px;">${esc(openErr?.message || String(openErr))}</div>
                <button id="offmeta-retry" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.2); cursor:pointer;">Retry</button>
              </div>
            `);
              root.getElementById("offmeta-retry")?.addEventListener("click", () => {
                loadOffMetaRepository();
              });
            }
          });
          return;
        }
        setSafeHTML(container, `
        <div style="text-align:center; padding:20px; color:#fca5a5;">
          <div style="font-weight:bold; margin-bottom:4px; font-size:11px;">Failed to load repository</div>
          <div style="font-size:9.5px; margin-bottom:8px;">${esc(rawMessage)}</div>
          <div style="display:flex; gap:6px; justify-content:center;">
            <button id="offmeta-retry" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.2); cursor:pointer;">Retry</button>
            <button id="offmeta-grant-access" style="margin:0; font-size:9.5px; padding:3px 8px; border-radius:4px; background:rgba(16,185,129,0.12); color:var(--accent-color); border:1px solid rgba(16,185,129,0.3); cursor:pointer;">Grant access</button>
          </div>
        </div>
      `);
        root.getElementById("offmeta-retry")?.addEventListener("click", () => {
          loadOffMetaRepository();
        });
        root.getElementById("offmeta-grant-access")?.addEventListener("click", async () => {
          try {
            const res = await browser.runtime.sendMessage({ kind: "openPermissionsPage" });
            if (!res || !res.ok) throw new Error(res?.error || "unknown error");
          } catch (openErr) {
            showToast("Failed to open permissions tab: " + (openErr?.message || String(openErr)), true);
          }
        });
      }
    }
    let activeSubTab = "offmeta-subtab-intro";
    function switchSubTab(subTabId) {
      activeSubTab = subTabId;
      const btns = root.querySelectorAll(".offmeta-subtab-btn");
      btns.forEach((b) => {
        const active = b.getAttribute("data-subtab") === subTabId;
        b.classList.toggle("active", active);
      });
      const statusEl = root.getElementById("offmeta-status");
      if (statusEl) statusEl.style.display = "none";
      renderOffMetaRepository();
    }
    function renderOffMetaRepository() {
      const container = root.getElementById("offmeta-repo-container");
      const searchContainer = root.getElementById("offmeta-search-container");
      if (!container || !offMetaSections) return;
      if (activeSubTab === "offmeta-subtab-intro") {
        if (searchContainer) searchContainer.style.display = "none";
        setSafeHTML(container, `
        <div style="font-size:11.5px; line-height:1.45; color:var(--text-primary); display:flex; flex-direction:column; gap:8px; padding:4px;">
          <div style="background:rgba(52,211,153,0.05); border:1px solid rgba(52,211,153,0.15); border-radius:6px; padding:8px 10px; margin-bottom:4px;">
            <span style="font-weight:700; color:var(--theme-text-color); font-size:12.5px;">Thank You</span>
            <p style="margin:4px 0 0 0; color:var(--text-primary);">A huge thank you to <strong>OffMetaGamer</strong> for graciously allowing this repository to be integrated directly into the AID Story Helper extension!</p>
          </div>
          
          <div style="border:1px solid var(--border-color); border-radius:6px; padding:8px 10px; background:rgba(255,255,255,0.01);">
            <div style="font-weight:700; color:var(--theme-text-color); font-size:12px; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.03em;">Note from OffMetaGamer:</div>
            <div style="font-style:italic; margin-bottom:8px; border-left:2px solid var(--theme-text-color); padding-left:8px; color:var(--text-secondary); font-size:11px;">
              "Special thanks to shiny, Leshok, Hawk, Dirty Kurtis, little hat, SeinSchatten, Zoocata, Aederia, hrafnsnorn, dragonxsx, and all of the other amazing AIN pioneers pushing the boundaries of what AI can do!"
            </div>
            
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
              <div>
                \u2665\uFE0FPlease keep in mind that I do this as a hobby, it is not my job\u2665\uFE0F
              </div>
              <div>
                This resource assumes that you have at least a basic understanding of Plot Components. If you do not understand the basics of AI Instructions, Plot Essentials, Author\u2019s Note, and Placeholders, you may want to first read the <a href="https://help.aidungeon.com/new-player-guide" target="_blank" style="color:var(--theme-text-color); font-weight:bold; text-decoration:underline;">New Player Guide</a> before attempting to utilize this resource. The primary goal is to offer a somewhat organized selection of tried and true AIN/AN that can solve almost any problem that you might run into. Any circumstance under which multiple options are provided with similar purposes indicates that it is worded for specific models or a slightly different effect. Test them until you find one that works well for the model you are using and your specific circumstances. DO NOT take everything in this document and put it into AIN all at once, it will both eat up an absurd amount of tokens and probably also produce terrible results. Instead, pick and choose lines that solve problems you are experiencing or use the sets provided to have a prebuilt experience.
              </div>
              <div style="margin-top:4px; border-top:1px solid var(--border-color); padding-top:8px; display:flex; flex-direction:column; gap:8px;">
                <div style="background:rgba(52,211,153,0.05); border:1px solid rgba(52,211,153,0.15); border-radius:6px; padding:8px 10px; color:var(--text-primary); font-size:11px; line-height:1.4;">
                  Anything that includes <code>\${character.name}</code> is a Placeholder for Scenario creation. In this extension, we dynamically replace <code>\${character.name}</code> with <code>{protagonist}</code> when applying instructions. If you are adding any line with placeholders manually, make sure to replace the placeholder with the relevant information. <code>\${character.name}</code> becomes Dave.
                </div>
                <div style="color:var(--text-secondary); font-size:11px; padding-left:4px;">
                  - <code>[ ]</code> and <code>{ }</code> are used to cluster information. This helps the AI keep track of information that is related to each other better, especially when formatting is otherwise ambiguous.
                </div>
              </div>
            </div>
          </div>
        </div>
      `);
        return;
      }
      if (searchContainer) searchContainer.style.display = "flex";
      const query = root.getElementById("offmeta-search")?.value?.trim().toLowerCase() || "";
      let html = "";
      for (const sec of offMetaSections) {
        if (activeSubTab === "offmeta-subtab-premade" && sec.title !== "\u{1F916} Premade AIN") continue;
        if (activeSubTab === "offmeta-subtab-anpe" && sec.title !== "\u{1F916} AN/PE") continue;
        if (activeSubTab === "offmeta-subtab-individual" && (sec.title === "\u{1F916} Premade AIN" || sec.title === "\u{1F916} AN/PE")) continue;
        let sectionHtml = "";
        let matchesSection = false;
        for (const group of sec.groups) {
          let groupHtml = "";
          let groupItemsFiltered = [];
          for (const item of group.items) {
            const contentMatch = item.content.toLowerCase().includes(query);
            const titleMatch = item.title && item.title.toLowerCase().includes(query);
            const sectionMatch = sec.title.toLowerCase().includes(query);
            const groupMatch = group.name && group.name.toLowerCase().includes(query);
            if (!query || contentMatch || titleMatch || sectionMatch || groupMatch) {
              groupItemsFiltered.push(item);
            }
          }
          if (groupItemsFiltered.length > 0) {
            if (group.name) {
              groupHtml += `<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin:8px 0 4px 4px;text-transform:uppercase;letter-spacing:0.02em;">${esc(group.name)}</div>`;
            }
            groupHtml += `<div style="display:flex;flex-direction:column;gap:6px;">`;
            for (const item of groupItemsFiltered) {
              const isBlock = item.type === "block";
              const displayTitle = item.title || (isBlock ? "Preset Block" : "Instruction");
              let itemContent = item.content;
              const protName = lastState?.protagonist || "";
              if (protName) {
                itemContent = itemContent.replace(/\{protagonist\}/gi, protName);
              }
              groupHtml += `
              <div class="offmeta-item-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;transition:all 0.2s ease;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
                  <span style="font-weight:600;font-size:11.5px;color:var(--theme-text-color);">${esc(displayTitle)}</span>
                  <div style="display:flex;gap:4px;align-items:center;">
                    <button class="offmeta-copy-btn" data-content="${esc(itemContent)}" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(255,255,255,0.04);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;" title="Copy to clipboard">Copy</button>
            `;
              if (sec.title === "\u{1F916} AN/PE") {
                groupHtml += `
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="an" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply to AN</button>
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="pe" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply to PE</button>
              `;
              } else {
                groupHtml += `
                    <button class="offmeta-apply-btn" data-id="${item.id}" data-type="ain" style="margin:0;padding:3px 6px;font-size:10px;background:rgba(16,185,129,0.1);color:#34d399;border:1px solid rgba(16,185,129,0.2);border-radius:4px;cursor:pointer;">Apply AIN</button>
              `;
              }
              groupHtml += `
                  </div>
                </div>
            `;
              if (isBlock) {
                groupHtml += `
                <details style="margin:0;border:none;background:none;padding:0;">
                  <summary style="cursor:pointer;font-size:10.5px;color:var(--text-secondary);padding:2px 0;outline:none;list-style:none;">
                    <span style="border-bottom:1px dashed var(--text-secondary);">Click to preview (${item.content.split("\n").length} lines)</span>
                  </summary>
                  <pre style="margin:4px 0 0 0;font-family:SFMono-Regular,Consolas,monospace;font-size:10px;background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;color:var(--text-primary);max-height:120px;overflow-y:auto;border:1px solid rgba(255,255,255,0.02);">${esc(itemContent)}</pre>
                </details>
              `;
              } else {
                groupHtml += `
                <div style="font-size:11px;color:var(--text-primary);line-height:1.35;word-break:break-word;">${esc(itemContent)}</div>
              `;
              }
              groupHtml += `</div>`;
            }
            groupHtml += `</div>`;
            sectionHtml += groupHtml;
            matchesSection = true;
          }
        }
        if (matchesSection) {
          const showSecHeader = activeSubTab === "offmeta-subtab-individual";
          html += `
          <div class="offmeta-section-card" style="border-bottom:1px solid var(--border-color);padding-bottom:10px;margin-bottom:6px;">
            ${showSecHeader ? `<div style="font-size:12px;font-weight:700;color:var(--theme-text-color);margin:6px 0;text-transform:uppercase;letter-spacing:0.03em;">${esc(sec.title)}</div>` : ""}
            ${sectionHtml}
          </div>
        `;
        }
      }
      if (!html) {
        html = `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:11.5px;">No matching instructions found.</div>`;
      }
      setSafeHTML(container, html);
      container.querySelectorAll(".offmeta-copy-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const target = e.currentTarget;
          const content = target.getAttribute("data-content") || "";
          navigator.clipboard.writeText(content).then(() => {
            const oldText = target.textContent;
            target.textContent = "Copied!";
            setTimeout(() => {
              target.textContent = oldText;
            }, 1500);
          }).catch((err) => {
            console.error("Clipboard copy failed:", err);
          });
        });
      });
      container.querySelectorAll(".offmeta-apply-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const target = e.currentTarget;
          const id = target.getAttribute("data-id") || "";
          const type = target.getAttribute("data-type") || "";
          let foundItem = null;
          for (const sec of offMetaSections) {
            for (const group of sec.groups) {
              const match = group.items.find((it) => it.id === id);
              if (match) {
                foundItem = match;
                break;
              }
            }
            if (foundItem) break;
          }
          if (!foundItem) return;
          const oldText = target.textContent;
          target.textContent = "Applying...";
          target.disabled = true;
          const statusEl = root.getElementById("offmeta-status");
          if (statusEl) {
            statusEl.style.display = "none";
          }
          try {
            const sid = lastState?.shortId;
            if (!sid) throw new Error("No active adventure loaded.");
            const res = await browser.runtime.sendMessage({
              kind: "applyOffMetaInstruction",
              shortId: sid,
              text: foundItem.content,
              type,
              itemType: foundItem.type
            });
            if (res && res.ok) {
              target.textContent = "Applied!";
              if (statusEl) {
                statusEl.textContent = res.message || "Successfully applied instruction!";
                statusEl.style.background = "rgba(16,185,129,0.1)";
                statusEl.style.color = "#34d399";
                statusEl.style.display = "block";
              }
              if (cbs.applyInstruction) cbs.applyInstruction();
            } else {
              throw new Error(res?.error || "Save rejected by background service worker.");
            }
          } catch (err) {
            target.textContent = "Failed";
            if (statusEl) {
              statusEl.textContent = err?.message || String(err);
              statusEl.style.background = "rgba(239,68,68,0.1)";
              statusEl.style.color = "#fca5a5";
              statusEl.style.display = "block";
            }
          } finally {
            setTimeout(() => {
              target.textContent = oldText;
              target.disabled = false;
            }, 3e3);
          }
        });
      });
    }
    function switchTab(tabId) {
      const panes = root.querySelectorAll(".tab-pane");
      const btns = root.querySelectorAll(".tab-btn");
      panes.forEach((p) => {
        if (p.id === tabId) {
          p.style.display = p.id === "tab-offmeta" || p.id === "tab-manager" ? "flex" : "block";
        } else {
          p.style.display = "none";
        }
      });
      btns.forEach((b) => {
        if (b.getAttribute("data-tab") === tabId) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
      if (tabId === "tab-offmeta") {
        loadOffMetaRepository();
      }
      if (tabId === "tab-manager" && lastState) {
        renderAdventuresManager(lastState);
      }
    }
    root.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        if (tabId) switchTab(tabId);
      });
    });
    function switchManagerSubtab(subtab) {
      const globalPane = root.getElementById("subpane-global");
      const explorerPane = root.getElementById("subpane-explorer");
      const btnGlobal = root.getElementById("btn-subtab-global");
      const btnExplorer = root.getElementById("btn-subtab-explorer");
      if (globalPane && explorerPane && btnGlobal && btnExplorer) {
        if (subtab === "global") {
          globalPane.style.display = "flex";
          explorerPane.style.display = "none";
          btnGlobal.classList.add("active");
          btnExplorer.classList.remove("active");
        } else {
          globalPane.style.display = "none";
          explorerPane.style.display = "flex";
          btnExplorer.classList.add("active");
          btnGlobal.classList.remove("active");
        }
      }
      if (lastState) {
        renderAdventuresManager(lastState);
      }
    }
    root.getElementById("btn-subtab-global")?.addEventListener("click", () => switchManagerSubtab("global"));
    root.getElementById("btn-subtab-explorer")?.addEventListener("click", () => switchManagerSubtab("explorer"));
    root.getElementById("btn-view-hidden-adv")?.addEventListener("click", async () => {
      try {
        const res = await browser.runtime.sendMessage({ kind: "getHiddenAdventures" });
        if (res?.error) {
          showToast(`Error: ${res.error}`, true);
        } else {
          showHiddenAdventuresModal(res.adventures || []);
        }
      } catch (err) {
        showToast(`Error: ${err?.message || err}`, true);
      }
    });
    root.getElementById("btn-show-add-global")?.addEventListener("click", () => {
      const form = root.getElementById("form-add-global");
      const btn = root.getElementById("btn-show-add-global");
      if (form && btn) {
        form.style.display = "flex";
        btn.style.display = "none";
      }
    });
    root.getElementById("btn-cancel-global")?.addEventListener("click", () => {
      const form = root.getElementById("form-add-global");
      const btn = root.getElementById("btn-show-add-global");
      if (form && btn) {
        form.style.display = "none";
        btn.style.display = "block";
        resetAddGlobalForm();
      }
    });
    root.getElementById("global-type")?.addEventListener("change", (e) => {
      const type = e.target.value;
      const scFields = root.getElementById("sc-fields");
      if (scFields) {
        scFields.style.display = type === "sc" ? "flex" : "none";
      }
    });
    root.getElementById("btn-save-global")?.addEventListener("click", async () => {
      const type = root.getElementById("global-type").value;
      const title = root.getElementById("global-title").value.trim();
      const value = root.getElementById("global-value").value.trim();
      if (!title || !value) {
        showToast("Title and Content value are required.", true);
        return;
      }
      const asset = {
        id: Math.floor(Math.random() * 1e9).toString() + "-" + Date.now(),
        type,
        title,
        value,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (type === "sc") {
        const scType = root.getElementById("global-sc-type").value;
        const keys = root.getElementById("global-keys").value.trim();
        const description = root.getElementById("global-description").value.trim();
        asset.keys = keys || void 0;
        asset.description = description || void 0;
        asset.cardType = scType;
      }
      if (cbs.saveGlobalAsset) {
        const btn = root.getElementById("btn-save-global");
        const oldText = btn.textContent;
        btn.textContent = "Creating...";
        btn.disabled = true;
        try {
          const res = await cbs.saveGlobalAsset(asset);
          if (res?.error) {
            showToast(`Failed to create: ${res.error}`, true);
          } else {
            showToast(`Created favorite '${title}'!`);
            const form = root.getElementById("form-add-global");
            const showBtn = root.getElementById("btn-show-add-global");
            if (form && showBtn) {
              form.style.display = "none";
              showBtn.style.display = "block";
            }
            resetAddGlobalForm();
            triggerRefresh();
          }
        } catch (err) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          btn.textContent = oldText;
          btn.disabled = false;
        }
      }
    });
    function showAdventureDeleteModal(shortId, advTitle) {
      const box2 = root.querySelector(".box");
      if (!box2) return;
      root.getElementById("adv-delete-modal")?.remove();
      const modal = document.createElement("div");
      modal.id = "adv-delete-modal";
      modal.style.cssText = `
        position:absolute;
        top:0;
        left:0;
        right:0;
        bottom:0;
        background:rgba(18,18,22,0.92);
        z-index:10000;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        padding:16px;
        box-sizing:border-box;
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      `;
      setSafeHTML(modal, `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:16px;width:100%;max-width:280px;box-sizing:border-box;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);">
          <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);text-align:center;">Delete Adventure Data?</div>
          <div style="font-size:11px;color:var(--text-secondary);text-align:center;line-height:1.4;word-break:break-all;">"${esc(advTitle)}"<br/><span style="color:var(--text-secondary);font-size:10px;opacity:0.8;">(${esc(shortId)})</span></div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
            <button id="modal-remove-view" style="width:100%;padding:6px;font-size:11px;margin:0;">Remove from view</button>
            <button id="modal-delete-all" style="width:100%;padding:6px;font-size:11px;margin:0;background:rgba(239,68,68,0.15);color:#fca5a5;border-color:rgba(239,68,68,0.25);font-weight:600;">Delete all adventure data</button>
            <button id="modal-cancel" style="width:100%;padding:6px;font-size:11px;margin:0;background:none;border:none;color:var(--text-secondary);">Cancel</button>
          </div>
        </div>
      `);
      box2.appendChild(modal);
      modal.querySelector("#modal-cancel")?.addEventListener("click", () => {
        modal.remove();
      });
      modal.querySelector("#modal-remove-view")?.addEventListener("click", async () => {
        try {
          const res = await browser.runtime.sendMessage({ kind: "hideAdventure", shortId });
          if (res?.error) {
            showToast(`Error: ${res.error}`, true);
          } else {
            showToast("Adventure removed from view.");
            triggerRefresh();
          }
        } catch (err) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          modal.remove();
        }
      });
      modal.querySelector("#modal-delete-all")?.addEventListener("click", async () => {
        try {
          const res = await browser.runtime.sendMessage({ kind: "deleteAdventure", shortId });
          if (res?.error) {
            showToast(`Error: ${res.error}`, true);
          } else {
            showToast("All adventure data deleted.");
            triggerRefresh();
          }
        } catch (err) {
          showToast(`Error: ${err?.message || err}`, true);
        } finally {
          modal.remove();
        }
      });
    }
    function showHiddenAdventuresModal(hiddenAdventures) {
      const box2 = root.querySelector(".box");
      if (!box2) return;
      root.getElementById("hidden-adv-modal")?.remove();
      const modal = document.createElement("div");
      modal.id = "hidden-adv-modal";
      modal.style.cssText = `
        position:absolute;
        top:0;
        left:0;
        right:0;
        bottom:0;
        background:rgba(18,18,22,0.92);
        z-index:10000;
        display:flex;
        flex-direction:column;
        padding:16px;
        box-sizing:border-box;
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
      `;
      let listHtml = "";
      if (hiddenAdventures.length === 0) {
        listHtml = `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No hidden adventures found.</div>`;
      } else {
        listHtml = hiddenAdventures.map((adv) => `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;margin-bottom:6px;gap:6px;box-sizing:border-box;width:100%;">
            <div style="display:flex;flex-direction:column;min-width:0;flex:1;text-align:left;">
              <span style="font-weight:600;font-size:11px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;" title="${esc(adv.title || "Untitled Adventure")}">${esc(adv.title || "Untitled Adventure")}</span>
              <span style="font-size:9.5px;color:var(--text-secondary);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">(${esc(adv.shortId)})</span>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <button class="btn-restore-adv btn-micro btn-micro--green" data-shortid="${adv.shortId}">Restore</button>
              <button class="btn-purge-adv btn-micro btn-micro--red" data-shortid="${adv.shortId}" data-title="${esc(adv.title || "Untitled Adventure")}">Delete</button>
            </div>
          </div>
        `).join("");
      }
      setSafeHTML(modal, `
        <div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:16px;width:100%;height:100%;max-height:100%;box-sizing:border-box;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);overflow:hidden;">
          <div style="font-weight:700;font-size:12.5px;color:var(--text-primary);text-align:center;flex-shrink:0;">Hidden Adventures</div>
          <div style="flex:1;overflow-y:auto;min-height:0;padding-right:4px;">
            ${listHtml}
          </div>
          <div style="display:flex;justify-content:center;margin-top:4px;flex-shrink:0;">
            <button id="modal-close-hidden" style="width:100%;padding:6px;font-size:11px;margin:0;">Close</button>
          </div>
        </div>
      `);
      box2.appendChild(modal);
      modal.querySelector("#modal-close-hidden")?.addEventListener("click", () => {
        modal.remove();
      });
      modal.querySelectorAll(".btn-restore-adv").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const shortId = btn.getAttribute("data-shortid") || "";
          if (!shortId) return;
          try {
            const res = await browser.runtime.sendMessage({ kind: "unhideAdventure", shortId });
            if (res?.error) {
              showToast(`Error: ${res.error}`, true);
            } else {
              showToast("Adventure restored to view.");
              triggerRefresh();
              modal.remove();
            }
          } catch (err) {
            showToast(`Error: ${err?.message || err}`, true);
          }
        });
      });
      modal.querySelectorAll(".btn-purge-adv").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const shortId = btn.getAttribute("data-shortid") || "";
          const advTitle = btn.getAttribute("data-title") || "Untitled Adventure";
          if (!shortId) return;
          showAdventureDeleteModal(shortId, advTitle);
          modal.remove();
        });
      });
    }
    function renderAdventuresManager(state) {
      const listGlobal = root.getElementById("global-assets-list");
      const listExplorer = root.getElementById("db-explorer-list");
      if (!listGlobal || !listExplorer) return;
      const openIds = /* @__PURE__ */ new Set();
      listExplorer.querySelectorAll("details[open]").forEach((el) => {
        const oid = el.getAttribute("data-open-id");
        if (oid) openIds.add(oid);
      });
      const openGlobalIds = /* @__PURE__ */ new Set();
      listGlobal.querySelectorAll("details[open]").forEach((el) => {
        const oid = el.getAttribute("data-open-id");
        if (oid) openGlobalIds.add(oid);
      });
      const isOpen = (id) => openIds.has(id) ? " open" : "";
      const isGlobalOpen = (id) => openGlobalIds.has(id) ? " open" : "";
      const SC_LABEL_ORDER = ["Characters", "Classes", "Races", "Locations", "Factions", "Custom"];
      function getCardTypeLabel(cardType) {
        if (!cardType) return "Custom";
        const lower = cardType.toLowerCase();
        const TYPE_LABELS = {
          character: "Characters",
          class: "Classes",
          race: "Races",
          location: "Locations",
          faction: "Factions",
          custom: "Custom"
        };
        if (TYPE_LABELS[lower]) return TYPE_LABELS[lower];
        return cardType.charAt(0).toUpperCase() + cardType.slice(1);
      }
      const isAssetFavorited = (type, title, value, keys) => {
        return globalAssets.some(
          (a) => a.type === type && a.title === title && a.value === value && (a.keys || "") === (keys || "")
        );
      };
      const globalAssets = state.globalAssets || [];
      if (globalAssets.length === 0) {
        setSafeHTML(listGlobal, `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No favorites stored yet. Add some below or favorite them from local adventures!</div>`);
      } else {
        const groups = { ain: [], an: [], pe: [], sc: [] };
        for (const a of globalAssets) {
          const group = groups[a.type];
          if (group) group.push(a);
        }
        const typeTitles = {
          ain: "AI Instructions (AIN)",
          an: "Author's Notes (AN)",
          pe: "Character Descriptions (PE)",
          sc: "Story Cards (SC)"
        };
        let html = "";
        for (const [type, items] of Object.entries(groups)) {
          if (items.length === 0) continue;
          if (type === "sc") {
            const scGroups = {};
            for (const item of items) {
              const lbl = getCardTypeLabel(item.cardType);
              if (!scGroups[lbl]) scGroups[lbl] = [];
              scGroups[lbl].push(item);
            }
            const rank = (l) => {
              const idx = SC_LABEL_ORDER.indexOf(l);
              return idx === -1 ? 1e3 : idx;
            };
            const sortedLabels = Object.keys(scGroups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
            for (const lbl of sortedLabels) {
              const subItems = scGroups[lbl] || [];
              const subKey = `sc-${lbl.toLowerCase().replace(/\s+/g, "-")}`;
              html += `<details class="group-header" data-open-id="global-cat-${subKey}"${isGlobalOpen(`global-cat-${subKey}`)}><summary><span>${esc(lbl)} (${subItems.length})</span></summary><div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">`;
              for (const item of subItems) {
                const escVal = esc(item.value);
                const scMeta = `<div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;"><strong>Keys:</strong> ${esc(item.keys || "")}</div>`;
                html += `
                <div class="global-asset-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;padding:8px;box-sizing:border-box;">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
                    <div style="font-weight:600;font-size:11.5px;color:var(--text-primary);word-break:break-all;">${esc(item.title)}</div>
                    <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                      ${!state.isManagerOnly ? `<button class="btn-import-asset btn-micro btn-micro--green">Import</button>` : ""}
                      <button class="btn-edit-asset btn-micro btn-micro--blue">Edit</button>
                      <button class="btn-delete-asset btn-micro btn-micro--red">Remove From Favorites</button>
                    </div>
                  </div>
                  ${scMeta}
                  <details style="cursor:pointer;" data-open-id="global-val-${item.id}"${isGlobalOpen(`global-val-${item.id}`)}>
                    <summary style="font-size:10.5px;color:var(--text-secondary);list-style:none;">Show value</summary>
                    <div style="margin-top:4px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;font-size:10.5px;color:var(--text-primary);white-space:pre-wrap;word-break:break-all;font-family:SFMono-Regular,Consolas,monospace;cursor:text;" class="selectable-text">${escVal}</div>
                  </details>
                </div>
              `;
              }
              html += `</div></details>`;
            }
          } else {
            html += `<details class="group-header" data-open-id="global-cat-${type}"${isGlobalOpen(`global-cat-${type}`)}><summary><span>${typeTitles[type]} (${items.length})</span></summary><div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">`;
            for (const item of items) {
              const escVal = esc(item.value);
              html += `
              <div class="global-asset-card" data-id="${item.id}" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;padding:8px;box-sizing:border-box;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px;">
                  <div style="font-weight:600;font-size:11.5px;color:var(--text-primary);word-break:break-all;">${esc(item.title)}</div>
                  <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
                    ${!state.isManagerOnly ? `<button class="btn-import-asset btn-micro btn-micro--green">Import</button>` : ""}
                    <button class="btn-edit-asset btn-micro btn-micro--blue">Edit</button>
                    <button class="btn-delete-asset btn-micro btn-micro--red">Remove From Favorites</button>
                  </div>
                </div>
                <details style="cursor:pointer;" data-open-id="global-val-${item.id}"${isGlobalOpen(`global-val-${item.id}`)}>
                  <summary style="font-size:10.5px;color:var(--text-secondary);list-style:none;">Show value</summary>
                  <div style="margin-top:4px;padding:6px;background:rgba(0,0,0,0.2);border-radius:4px;font-size:10.5px;color:var(--text-primary);white-space:pre-wrap;word-break:break-all;font-family:SFMono-Regular,Consolas,monospace;cursor:text;" class="selectable-text">${escVal}</div>
                </details>
              </div>
            `;
            }
            html += `</div></details>`;
          }
        }
        setSafeHTML(listGlobal, html);
        listGlobal.querySelectorAll(".btn-import-asset").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const card = btn.closest(".global-asset-card");
            const assetId = card?.getAttribute("data-id") || "";
            if (assetId && state.shortId && cbs.importGlobalAsset) {
              btn.textContent = "Importing...";
              const res = await cbs.importGlobalAsset(assetId);
              if (res?.error) {
                showToast(`Import failed: ${res.error}`, true);
                btn.textContent = "Import";
              } else {
                showToast(res?.message || "Successfully imported asset!");
                btn.textContent = "Imported";
                setTimeout(() => {
                  btn.textContent = "Import";
                }, 2e3);
              }
            }
          });
        });
        listGlobal.querySelectorAll(".btn-delete-asset").forEach((btn) => {
          let armTimeout = null;
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const card = btn.closest(".global-asset-card");
            const assetId = card?.getAttribute("data-id") || "";
            if (!assetId || !cbs.deleteGlobalAsset) return;
            if (btn.classList.contains("armed")) {
              clearTimeout(armTimeout);
              btn.classList.remove("armed");
              btn.textContent = "Remove From Favorites";
              const res = await cbs.deleteGlobalAsset(assetId);
              if (res?.error) {
                showToast(`Remove failed: ${res.error}`, true);
              } else {
                showToast("Removed from favorites.");
                triggerRefresh();
              }
            } else {
              btn.classList.add("armed");
              btn.textContent = "Confirm Remove?";
              armTimeout = setTimeout(() => {
                btn.classList.remove("armed");
                btn.textContent = "Remove From Favorites";
              }, 3e3);
            }
          });
        });
        listGlobal.querySelectorAll(".btn-edit-asset").forEach((btn) => {
          btn.addEventListener("click", () => {
            const card = btn.closest(".global-asset-card");
            const assetId = card?.getAttribute("data-id") || "";
            if (!assetId) return;
            const asset = globalAssets.find((a) => a.id === assetId);
            if (!asset) return;
            let currentType = asset.type;
            const getFormValues = () => {
              const scTypeSelect = card.querySelector(".edit-sc-type");
              const customTypeInput = card.querySelector(".edit-sc-custom-type");
              const titleInput = card.querySelector(".edit-asset-title");
              const valueTextarea = card.querySelector(".edit-asset-value");
              const keysInput = card.querySelector(".edit-asset-keys");
              const descInput = card.querySelector(".edit-asset-desc");
              let cardType = void 0;
              if (scTypeSelect) {
                if (scTypeSelect.value === "custom") {
                  cardType = customTypeInput ? customTypeInput.value.trim() : "custom";
                  if (!cardType) cardType = "custom";
                } else {
                  cardType = scTypeSelect.value;
                }
              }
              return {
                title: titleInput ? titleInput.value : asset.title,
                value: valueTextarea ? valueTextarea.value : asset.value,
                keys: keysInput ? keysInput.value : asset.keys,
                description: descInput ? descInput.value : asset.description,
                cardType: cardType ?? asset.cardType
              };
            };
            const renderDynamicFields = (type, vals) => {
              if (type === "sc") {
                const standardTypes = ["character", "location", "faction", "class", "race"];
                const currentCardType = vals.cardType || "custom";
                const isStandard = standardTypes.includes(currentCardType.toLowerCase());
                const scType = isStandard ? currentCardType.toLowerCase() : "custom";
                const customTypeValue = !isStandard && currentCardType.toLowerCase() !== "custom" ? currentCardType : "";
                return `
                <label style="font-size:9.5px;font-weight:600;margin:0;">Story Card Type</label>
                <select class="edit-sc-type input-compact input-dark" style="margin:0;">
                  <option value="character" ${scType === "character" ? "selected" : ""}>Character</option>
                  <option value="location" ${scType === "location" ? "selected" : ""}>Location</option>
                  <option value="faction" ${scType === "faction" ? "selected" : ""}>Faction</option>
                  <option value="class" ${scType === "class" ? "selected" : ""}>Class</option>
                  <option value="race" ${scType === "race" ? "selected" : ""}>Race</option>
                  <option value="custom" ${scType === "custom" ? "selected" : ""}>Custom</option>
                </select>

                <div class="edit-sc-custom-type-container" style="display:${scType === "custom" ? "flex" : "none"};flex-direction:column;gap:6px;">
                  <label style="font-size:9.5px;font-weight:600;margin:0;">Custom Type</label>
                  <input class="edit-sc-custom-type input-compact input-dark" type="text" value="${esc(customTypeValue)}" placeholder="Enter custom type..." style="margin:0;" />
                </div>

                <label style="font-size:9.5px;font-weight:600;margin:0;">Name</label>
                <input class="edit-asset-title input-compact input-dark" type="text" value="${esc(vals.title)}" style="margin:0;" />

                <label style="font-size:9.5px;font-weight:600;margin:0;">Entry</label>
                <textarea class="edit-asset-value input-compact input-dark" rows="6" style="margin:0;font-family:SFMono-Regular,Consolas,monospace;resize:vertical;">${esc(vals.value)}</textarea>

                <label style="font-size:9.5px;font-weight:600;margin:0;">Triggers</label>
                <input class="edit-asset-keys input-compact input-dark" type="text" value="${esc(vals.keys || "")}" style="margin:0;" />

                <label style="font-size:9.5px;font-weight:600;margin:0;">Notes</label>
                <input class="edit-asset-desc input-compact input-dark" type="text" value="${esc(vals.description || "")}" style="margin:0;" />
              `;
              } else {
                return `
                <label style="font-size:9.5px;font-weight:600;margin:0;">Title</label>
                <input class="edit-asset-title input-compact input-dark" type="text" value="${esc(vals.title)}" style="margin:0;" />

                <label style="font-size:9.5px;font-weight:600;margin:0;">Value</label>
                <textarea class="edit-asset-value input-compact input-dark" rows="6" style="margin:0;font-family:SFMono-Regular,Consolas,monospace;resize:vertical;">${esc(vals.value)}</textarea>
              `;
              }
            };
            setSafeHTML(card, `
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--text-secondary);">Edit Favorite</div>
              
              <label style="font-size:9.5px;font-weight:600;margin:0;">Asset Type</label>
              <select class="edit-asset-type input-compact input-dark" style="margin:0;">
                <option value="ain" ${currentType === "ain" ? "selected" : ""}>AI Instructions (AIN)</option>
                <option value="an" ${currentType === "an" ? "selected" : ""}>Author's Note (AN)</option>
                <option value="pe" ${currentType === "pe" ? "selected" : ""}>Character Description (PE)</option>
                <option value="sc" ${currentType === "sc" ? "selected" : ""}>Story Card (SC)</option>
              </select>

              <div class="dynamic-edit-fields" style="display:flex;flex-direction:column;gap:6px;">
              </div>
              
              <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:4px;">
                <button class="btn-save-edit" style="margin:0;padding:2px 8px;font-size:10px;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:4px;cursor:pointer;">Save</button>
                <button class="btn-cancel-edit btn-cancel" style="margin:0;">Cancel</button>
              </div>
            </div>
          `);
            const dynamicContainer = card.querySelector(".dynamic-edit-fields");
            const initialVals = {
              title: asset.title,
              value: asset.value,
              keys: asset.keys,
              description: asset.description,
              cardType: asset.cardType
            };
            const bindDynamicFieldsListeners = () => {
              const scTypeSelect = card.querySelector(".edit-sc-type");
              scTypeSelect?.addEventListener("change", (e) => {
                const scType = e.target.value;
                const customTypeContainer = card.querySelector(".edit-sc-custom-type-container");
                if (customTypeContainer) {
                  customTypeContainer.style.display = scType === "custom" ? "flex" : "none";
                }
              });
            };
            if (dynamicContainer) {
              setSafeHTML(dynamicContainer, renderDynamicFields(currentType, initialVals));
              bindDynamicFieldsListeners();
            }
            card.querySelector(".edit-asset-type")?.addEventListener("change", (e) => {
              const newType = e.target.value;
              const currentVals = getFormValues();
              currentType = newType;
              if (dynamicContainer) {
                setSafeHTML(dynamicContainer, renderDynamicFields(newType, currentVals));
                bindDynamicFieldsListeners();
              }
            });
            card.querySelector(".btn-cancel-edit")?.addEventListener("click", () => {
              triggerRefresh();
            });
            card.querySelector(".btn-save-edit")?.addEventListener("click", async () => {
              const typeSelect = card.querySelector(".edit-asset-type");
              const vals = getFormValues();
              if (cbs.saveGlobalAsset) {
                const newType = typeSelect.value;
                const updatedAsset = {
                  ...asset,
                  type: newType,
                  title: vals.title,
                  value: vals.value,
                  keys: newType === "sc" ? vals.keys : void 0,
                  description: newType === "sc" ? vals.description : void 0,
                  cardType: newType === "sc" ? vals.cardType : void 0
                };
                const res = await cbs.saveGlobalAsset(updatedAsset);
                if (res?.error) {
                  showToast(`Save failed: ${res.error}`, true);
                } else {
                  showToast("Favorite updated.");
                  triggerRefresh();
                }
              }
            });
          });
        });
      }
      const adventures = [...state.adventures || []].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const allCards = state.isManagerOnly ? state.cards || [] : state.allCards || [];
      if (adventures.length === 0) {
        setSafeHTML(listExplorer, `<div style="text-align:center;color:var(--text-secondary);padding:20px 0;font-size:11.5px;">No saved adventures found in the database.</div>`);
      } else {
        let explorerHtml = "";
        for (const adv of adventures) {
          const advCards = allCards.filter((c) => c.shortId === adv.shortId && !c.deletedAt);
          const plotBlocks = parsePlotEssentials(adv.memory || "");
          const restOfPE = getRestOfPlotEssentials(adv.memory || "");
          let assetsCount = 0;
          if (adv.instructions) assetsCount++;
          if (adv.authorsNote) assetsCount++;
          assetsCount += plotBlocks.length;
          if (plotBlocks.length === 0 && restOfPE) assetsCount++;
          assetsCount += advCards.length;
          explorerHtml += `
          <details class="adv-explorer-card" style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px;box-sizing:border-box;" data-shortid="${adv.shortId}" data-open-id="adv-${adv.shortId}"${isOpen(`adv-${adv.shortId}`)}>
            <summary style="padding:8px;font-weight:600;font-size:11.5px;color:var(--text-primary);cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">
              <span style="flex:1;word-break:break-all;font-size:11.5px;text-align:left;">\u{1F4C1} ${esc(adv.title || "Untitled Adventure")} <span style="font-weight:normal;font-size:9.5px;color:var(--text-secondary);">(${esc(adv.shortId)})</span></span>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <span style="font-size:9.5px;background:var(--btn-bg);padding:2px 6px;border-radius:4px;color:var(--text-secondary);">${assetsCount} assets</span>
                <button class="btn-delete-adv btn-micro btn-micro--red" data-shortid="${adv.shortId}" data-title="${esc(adv.title || "Untitled Adventure")}">Remove from...</button>
              </div>
            </summary>
            <div style="padding:0 8px 8px 8px;border-top:1px solid var(--border-color);margin-top:4px;display:flex;flex-direction:column;gap:8px;">
              ${adv.instructions ? (() => {
            const isFav = isAssetFavorited("ain", `AIN from ${adv.title || "Adventure"}`, adv.instructions);
            const starChar = isFav ? "\u2605" : "\u2606";
            const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
            return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-ain"${isOpen(`cat-${adv.shortId}-ain`)}>
                    <summary><span>\u2699\uFE0F AI Instructions</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                          <span style="font-size:10px;color:var(--text-secondary);">Instruction Content</span>
                          <button class="btn-favorite-local" data-type="ain" data-title="AIN from ${esc(adv.title || "Adventure")}" data-value="${esc(adv.instructions)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                        </div>
                        <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(adv.instructions)}</div>
                      </div>
                    </div>
                  </details>
                `;
          })() : ""}
              
              ${plotBlocks.length > 0 || restOfPE ? (() => {
            const countText = plotBlocks.length > 0 ? ` (${plotBlocks.length})` : "";
            return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-pe"${isOpen(`cat-${adv.shortId}-pe`)}>
                    <summary><span>\u{1F465} Plot Essentials${countText}</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      ${plotBlocks.map((b) => {
              const isFav = isAssetFavorited("pe", b.name, b.text);
              const starChar = isFav ? "\u2605" : "\u2606";
              const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
              return `
                          <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                              <span style="font-weight:600;font-size:11px;color:var(--text-primary);">${esc(b.name)}</span>
                              <button class="btn-favorite-local" data-type="pe" data-title="${esc(b.name)}" data-value="${esc(b.text)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                            </div>
                            <details style="cursor:pointer;margin-top:2px;" data-open-id="char-${adv.shortId}-${esc(b.name)}"${isOpen(`char-${adv.shortId}-${esc(b.name)}`)}>
                              <summary style="font-size:10px;color:var(--text-secondary);list-style:none;outline:none;user-select:none;">Show description...</summary>
                              <div style="font-size:10.5px;color:var(--text-secondary);white-space:pre-wrap;margin-top:2px;cursor:text;" class="selectable-text">${esc(b.text)}</div>
                            </details>
                          </div>
                        `;
            }).join("")}
                      
                      ${restOfPE ? `
                        <details class="local-category-details" style="margin-top:4px;" data-open-id="cat-${adv.shortId}-pe-full"${isOpen(`cat-${adv.shortId}-pe-full`)}>
                          <summary><span>\u{1F4C4} See Full Plot Essentials</span></summary>
                          <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                            <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                              <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:200px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(restOfPE)}</div>
                            </div>
                          </div>
                        </details>
                      ` : ""}
                    </div>
                  </details>
                `;
          })() : ""}
              
              ${adv.authorsNote ? (() => {
            const isFav = isAssetFavorited("an", `AN from ${adv.title || "Adventure"}`, adv.authorsNote);
            const starChar = isFav ? "\u2605" : "\u2606";
            const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
            return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-an"${isOpen(`cat-${adv.shortId}-an`)}>
                    <summary><span>\u{1F4DD} Author's Note</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;cursor:default;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                          <span style="font-size:10px;color:var(--text-secondary);">Author's Note Content</span>
                          <button class="btn-favorite-local" data-type="an" data-title="AN from ${esc(adv.title || "Adventure")}" data-value="${esc(adv.authorsNote)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                        </div>
                        <div style="font-size:10.5px;color:var(--text-primary);font-family:SFMono-Regular,Consolas,monospace;white-space:pre-wrap;max-height:120px;overflow-y:auto;word-break:break-all;margin-top:2px;" class="selectable-text">${esc(adv.authorsNote)}</div>
                      </div>
                    </div>
                  </details>
                `;
          })() : ""}

              ${advCards.length > 0 ? (() => {
            const scGroups = {};
            for (const c of advCards) {
              const lbl = getCardTypeLabel(c.type);
              if (!scGroups[lbl]) scGroups[lbl] = [];
              scGroups[lbl].push(c);
            }
            const rank = (l) => {
              const idx = SC_LABEL_ORDER.indexOf(l);
              return idx === -1 ? 1e3 : idx;
            };
            const sortedLabels = Object.keys(scGroups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
            return `
                  <details class="group-header" data-open-id="cat-${adv.shortId}-sc"${isOpen(`cat-${adv.shortId}-sc`)}>
                    <summary><span>\u{1F5C2}\uFE0F Story Cards (${advCards.length})</span></summary>
                    <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                      ${sortedLabels.map((lbl) => {
              const subCards = scGroups[lbl] || [];
              const subKey = `sc-${lbl.toLowerCase().replace(/\s+/g, "-")}`;
              return `
                          <details class="local-category-details" data-open-id="cat-${adv.shortId}-${subKey}"${isOpen(`cat-${adv.shortId}-${subKey}`)}>
                            <summary><span>${esc(lbl)} (${subCards.length})</span></summary>
                            <div style="padding:4px 8px 8px; display:flex; flex-direction:column; gap:6px;">
                              ${subCards.map((c) => {
                const isFav = isAssetFavorited("sc", c.title || "", c.value, c.keys);
                const starChar = isFav ? "\u2605" : "\u2606";
                const starColor = isFav ? "var(--theme-text-color)" : "var(--text-secondary)";
                return `
                                  <div class="local-asset-row" style="background:rgba(0,0,0,0.15);padding:6px;border-radius:4px;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                      <span style="font-weight:600;font-size:11px;color:var(--text-primary);">${esc(c.title || c.keys || "Untitled")}</span>
                                      <button class="btn-favorite-local" data-type="sc" data-title="${esc(c.title || "")}" data-keys="${esc(c.keys || "")}" data-value="${esc(c.value)}" data-description="${esc(c.description || "")}" data-cardtype="${esc(c.type)}" style="background:none;border:none;color:${starColor};cursor:pointer;padding:2px;font-size:14px;" title="Toggle Favorite">${starChar}</button>
                                    </div>
                                    <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;"><strong>Keys:</strong> ${esc(c.keys || "")}</div>
                                    <details style="cursor:pointer;margin-top:2px;" data-open-id="sc-${adv.shortId}-${c.id}"${isOpen(`sc-${adv.shortId}-${c.id}`)}>
                                      <summary style="font-size:10px;color:var(--text-secondary);list-style:none;outline:none;user-select:none;">Show entry...</summary>
                                      <div style="font-size:10.5px;color:var(--text-secondary);white-space:pre-wrap;margin-top:2px;cursor:text;" class="selectable-text">${esc(c.value)}</div>
                                      ${c.description ? `<div style="font-size:9.5px;color:var(--text-muted);border-top:1px solid rgba(255,255,255,0.05);margin-top:4px;padding-top:4px;cursor:text;" class="selectable-text">${esc(c.description)}</div>` : ""}
                                    </details>
                                  </div>
                                `;
              }).join("")}
                            </div>
                          </details>
                        `;
            }).join("")}
                    </div>
                  </details>
                `;
          })() : ""}
            </div>
          </details>
        `;
        }
        setSafeHTML(listExplorer, explorerHtml);
        listExplorer.querySelectorAll(".btn-favorite-local").forEach((el) => {
          const btn = el;
          btn.addEventListener("click", async () => {
            const type = btn.getAttribute("data-type") || "";
            const title = btn.getAttribute("data-title") || "";
            const keys = btn.getAttribute("data-keys") || "";
            const value = btn.getAttribute("data-value") || "";
            const description = btn.getAttribute("data-description") || "";
            const cardType = btn.getAttribute("data-cardtype") || "";
            const existing = globalAssets.find(
              (a) => a.type === type && a.title === title && a.value === value && (a.keys || "") === (keys || "")
            );
            if (existing) {
              if (cbs.deleteGlobalAsset) {
                btn.textContent = "\u2606";
                btn.style.color = "var(--text-secondary)";
                const res = await cbs.deleteGlobalAsset(existing.id);
                if (res?.error) {
                  showToast(`Failed to remove favorite: ${res.error}`, true);
                  btn.textContent = "\u2605";
                  btn.style.color = "var(--theme-text-color)";
                } else {
                  showToast(`Removed '${title}' from favorites.`);
                  triggerRefresh();
                }
              }
            } else {
              if (cbs.saveGlobalAsset) {
                btn.textContent = "\u2605";
                btn.style.color = "var(--theme-text-color)";
                const asset = {
                  id: Math.floor(Math.random() * 1e9).toString() + "-" + Date.now(),
                  type,
                  title,
                  keys: keys || void 0,
                  value,
                  description: description || void 0,
                  createdAt: (/* @__PURE__ */ new Date()).toISOString(),
                  cardType: cardType || void 0
                };
                const res = await cbs.saveGlobalAsset(asset);
                if (res?.error) {
                  showToast(`Failed to favorite: ${res.error}`, true);
                  btn.textContent = "\u2606";
                  btn.style.color = "var(--text-secondary)";
                } else {
                  showToast(`Added '${title}' to Favorites!`);
                  triggerRefresh();
                }
              }
            }
          });
        });
        listExplorer.querySelectorAll(".btn-delete-adv").forEach((el) => {
          const btn = el;
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const shortId = btn.getAttribute("data-shortid") || "";
            const advTitle = btn.getAttribute("data-title") || "Untitled Adventure";
            if (shortId) {
              showAdventureDeleteModal(shortId, advTitle);
            }
          });
        });
      }
    }
    function resetAddGlobalForm() {
      const title = root.getElementById("global-title");
      const val = root.getElementById("global-value");
      const keys = root.getElementById("global-keys");
      const desc = root.getElementById("global-description");
      const type = root.getElementById("global-type");
      const scFields = root.getElementById("sc-fields");
      if (title) title.value = "";
      if (val) val.value = "";
      if (keys) keys.value = "";
      if (desc) desc.value = "";
      if (type) type.value = "ain";
      if (scFields) scFields.style.display = "none";
    }
    root.querySelectorAll(".offmeta-subtab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const subTabId = btn.getAttribute("data-subtab");
        if (subTabId) switchSubTab(subTabId);
      });
    });
    root.getElementById("offmeta-search")?.addEventListener("input", () => {
      const statusEl = root.getElementById("offmeta-status");
      if (statusEl) statusEl.style.display = "none";
      renderOffMetaRepository();
    });
    $("open-settings").addEventListener("click", () => {
      root.getElementById("prompt-s1").value = lastState?.settings?.customPromptSection1 || DEFAULT_PROMPT_SECTION_1;
      root.getElementById("prompt-s2").value = lastState?.settings?.customPromptSection2 || DEFAULT_PROMPT_SECTION_2;
      root.getElementById("prompt-s3").value = lastState?.settings?.customPromptSection3 || DEFAULT_PROMPT_SECTION_3;
      root.getElementById("prompt-s4").value = lastState?.settings?.customPromptSection4 || DEFAULT_PROMPT_SECTION_4;
      for (const k of TYPE_KEYS) {
        const el = root.getElementById("cc-" + k);
        if (el) el.value = lastState?.settings?.cardCommands?.[k] || DEFAULT_CARD_COMMANDS[k] || "";
      }
      const fmtEl = root.getElementById("fmt-mode");
      if (fmtEl) fmtEl.value = lastState?.settings?.formattingMode || DEFAULT_FORMATTING_MODE;
      showSettingsView();
    });
    $("cancel-settings").addEventListener("click", showTrackerView);
    $("view-settings").addEventListener("click", (e) => {
      const target = e.target;
      const genQrBtn = target.closest("#gen-qr-btn");
      if (genQrBtn && lastState?.settings) {
        genQrBtn.disabled = true;
        const originalText = genQrBtn.textContent;
        genQrBtn.textContent = "\u23F3 Generating...";
        compressSettings(lastState.settings).then((payload) => {
          showQrModal(payload);
        }).catch((err) => {
          console.error("[AID panel] QR generation failed:", err);
        }).finally(() => {
          genQrBtn.disabled = false;
          genQrBtn.textContent = originalText;
        });
      }
    });
    $("info-action-lookback").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-action-lookback").style.display = "flex";
    });
    $("info-memoraid-lookback").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memoraid-lookback").style.display = "flex";
    });
    $("info-memories").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memories").style.display = "flex";
    });
    $("info-memoraid-thought").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memoraid-thought").style.display = "flex";
    });
    $("info-memoraid-presence").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-memoraid-presence").style.display = "flex";
    });
    $("info-intercept-timeout").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-intercept-timeout").style.display = "flex";
    });
    $("info-help").addEventListener("click", (e) => {
      e.stopPropagation();
      $("overlay-help").style.display = "flex";
    });
    let syncKeys = true;
    const acTitleInput = root.getElementById("ac-title");
    const acKeysInput = root.getElementById("ac-keys");
    acTitleInput.addEventListener("input", () => {
      if (syncKeys) {
        acKeysInput.value = acTitleInput.value.trim().toLowerCase();
      }
    });
    acKeysInput.addEventListener("input", () => {
      syncKeys = false;
    });
    {
      const acTypeSel = root.getElementById("ac-type");
      const acCustom = root.getElementById("ac-custom-type");
      acTypeSel?.addEventListener("change", () => {
        acCustom.style.display = acTypeSel.value === "custom" ? "block" : "none";
        if (acTypeSel.value === "custom") acCustom.focus();
      });
    }
    $("create-card-trigger").addEventListener("click", (e) => {
      e.stopPropagation();
      syncKeys = true;
      acTitleInput.value = "";
      acKeysInput.value = "";
      root.getElementById("ac-desc").value = "";
      root.getElementById("ac-value").value = "";
      const acTypeSel = root.getElementById("ac-type");
      setSafeHTML(acTypeSel, buildTypePickerOptions(lastState?.cards ?? [], "character").replace(/<option value="">None<\/option>/, "") + `<option value="memory">Memory</option>`);
      acTypeSel.value = "character";
      const acCustom = root.getElementById("ac-custom-type");
      acCustom.value = "";
      acCustom.style.display = "none";
      $("overlay-add-card").style.display = "flex";
    });
    $("ac-submit").addEventListener("click", async () => {
      if (!cbs.createStoryCard) return;
      let type = root.getElementById("ac-type").value;
      if (type === "custom") {
        const ct = root.getElementById("ac-custom-type").value.trim();
        if (ct) type = ct;
      }
      const title = acTitleInput.value.trim();
      const keys = acKeysInput.value.trim();
      const description = root.getElementById("ac-desc").value.trim();
      const value = root.getElementById("ac-value").value.trim();
      if (!title) {
        showToast("Title / Name is required!", true);
        return;
      }
      const btnSubmit = root.getElementById("ac-submit");
      btnSubmit.disabled = true;
      btnSubmit.textContent = "\u23F3 Creating card on AID...";
      try {
        const res = await cbs.createStoryCard({ type, title, keys, value, description });
        if (res.error) {
          showToast(res.error, true);
        } else {
          showToast("Story card created successfully!");
          $("overlay-add-card").style.display = "none";
        }
      } catch (err) {
        showToast(err?.message || String(err), true);
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Create & Push to AID";
      }
    });
    root.querySelectorAll(".overlay-close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-close");
        if (id) $(id).style.display = "none";
      });
    });
    let activeTabId = "main-tab-home";
    let lastViewedMemoriesCount = -1;
    const knownMemories = /* @__PURE__ */ new Set();
    function switchMainTab(tabId) {
      activeTabId = tabId;
      const panes = root.querySelectorAll(".main-tab-pane");
      const btns = root.querySelectorAll(".main-tab-btn");
      panes.forEach((p) => {
        p.style.display = p.id === tabId ? "flex" : "none";
      });
      btns.forEach((b) => {
        if (b.getAttribute("data-tab") === tabId) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
      if (tabId === "main-tab-memories") {
        const badge = root.getElementById("unread-memories-badge");
        if (badge) {
          badge.style.display = "none";
          badge.className = "";
        }
        if (lastState?.aidMemories) {
          lastViewedMemoriesCount = lastState.aidMemories.length;
        }
      } else if (tabId === "main-tab-home") {
        const pendingBadge = root.getElementById("home-pending-badge");
        if (pendingBadge) {
          pendingBadge.style.display = "none";
          pendingBadge.className = "";
        }
      }
    }
    root.querySelectorAll(".main-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        if (tabId) switchMainTab(tabId);
      });
    });
    function navigateToSearchResult(it) {
      if (it.kind === "npc") {
        switchMainTab("main-tab-memories");
        root.querySelector('[data-mbtab="mb-npc"]')?.click();
        setTimeout(() => {
          const drawer = root.querySelector(`#mb-npc details[data-key="mbnpc:${CSS.escape(it.title)}"]`);
          if (drawer) {
            drawer.open = true;
            drawer.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        }, 50);
        return;
      }
      switchMainTab("main-tab-tracker");
      setTimeout(() => {
        const drawer = root.querySelector(`#results details.char-card[data-card-title="${CSS.escape(it.title)}"]`);
        if (drawer) {
          drawer.open = true;
          drawer.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      }, 50);
    }
    {
      const searchInput = root.getElementById("home-search");
      const resultsEl = root.getElementById("home-search-results");
      const renderResults = () => {
        if (!searchInput || !resultsEl) return;
        const items = searchPanelItems(searchInput.value, lastState?.cards);
        if (!items.length) {
          resultsEl.style.display = "none";
          resultsEl.textContent = "";
          return;
        }
        setSafeHTML(resultsEl, items.map((it, i) => `<div class="home-result-row" data-res-idx="${i}">
           <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(it.title)}</span>
           <span class="home-result-sub">${esc(it.sub)}</span>
         </div>`).join(""));
        resultsEl.style.display = "flex";
        resultsEl.querySelectorAll("[data-res-idx]").forEach((row) => {
          row.addEventListener("click", () => {
            const it = items[Number(row.getAttribute("data-res-idx"))];
            if (!it) return;
            resultsEl.style.display = "none";
            searchInput.value = "";
            navigateToSearchResult(it);
          });
        });
      };
      let searchTimer;
      searchInput?.addEventListener("input", () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(renderResults, 120);
      });
    }
    const lcBtnAddCard = root.getElementById("lc-btn-add-card");
    const lcAddCardForm = root.getElementById("lc-add-card-form");
    const lcAddCancelBtn = root.getElementById("lc-add-cancel-btn");
    const lcAddSubmitBtn = root.getElementById("lc-add-submit-btn");
    if (lcBtnAddCard && lcAddCardForm) {
      lcBtnAddCard.addEventListener("click", () => {
        if (lcAddCardForm.style.display === "none") {
          lcAddCardForm.style.display = "flex";
          const ownerSelect = root.getElementById("lc-add-owner");
          if (ownerSelect) {
            const rosterText = lastState?.settings?.livingCharactersRoster || "";
            let roster = rosterText.split("\n").map((n) => n.trim()).filter(Boolean);
            if (roster.length === 0 && lastState?.cards) {
              roster = lastState.cards.filter((c) => !c.deletedAt && normalizeType(c.type) === "character" && !(c.title || "").toLowerCase().endsWith(" (memory)")).map((c) => c.title || "").filter(Boolean);
            }
            setSafeHTML(ownerSelect, roster.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join(""));
          }
        } else {
          lcAddCardForm.style.display = "none";
        }
      });
    }
    if (lcAddCancelBtn && lcAddCardForm) {
      lcAddCancelBtn.addEventListener("click", () => {
        lcAddCardForm.style.display = "none";
      });
    }
    if (lcAddSubmitBtn && lcAddCardForm) {
      lcAddSubmitBtn.addEventListener("click", async () => {
        const ownerSelect = root.getElementById("lc-add-owner");
        const targetInput = root.getElementById("lc-add-target");
        const pressureInput = root.getElementById("lc-add-pressure");
        const owner = ownerSelect?.value.trim();
        const target = targetInput?.value.trim();
        const pressure = pressureInput?.value.trim() || "friendship";
        if (!owner || !target) {
          showToast("Owner and Target are required!", true);
          return;
        }
        lcAddSubmitBtn.disabled = true;
        lcAddSubmitBtn.textContent = "\u23F3 Creating...";
        try {
          const titlePrefix = lastState?.settings?.livingCharactersTitlePrefix || "Life - ";
          const keyPrefix = lastState?.settings?.livingCharactersKeyPrefix || "chaos-v2:";
          const initialValue = buildLifeCardValue({ owner, target, pressure, occurrence: "none", momentum: "low", status: "seedling" });
          const initialDesc = `Social Relationship History:
- Seeded as seedling ${pressure} toward ${target}`;
          if (cbs.createStoryCard) {
            const res = await cbs.createStoryCard({
              type: "Life",
              title: `${titlePrefix}${owner}`,
              keys: `${keyPrefix}${keyName(owner)},${owner},${target}`,
              value: initialValue,
              description: initialDesc
            });
            if (res.error) {
              showToast(res.error, true);
            } else {
              if (cbs.enqueueLifeInjection) {
                cbs.enqueueLifeInjection(owner, target, pressure, "low").catch(() => {
                });
              }
              showToast(`Seeded Life Card for ${owner}!`);
              lcAddCardForm.style.display = "none";
              if (targetInput) targetInput.value = "";
              if (pressureInput) pressureInput.value = "";
            }
          }
        } catch (err) {
          showToast(err?.message || String(err), true);
        } finally {
          lcAddSubmitBtn.disabled = false;
          lcAddSubmitBtn.textContent = "Create Life Card";
        }
      });
    }
    const memListEl = root.getElementById("aid-memories-list");
    if (memListEl) {
      memListEl.addEventListener("click", (e) => {
        const target = e.target;
        const editBtn = target.closest(".mem-edit-btn");
        if (editBtn) {
          const card = editBtn.closest(".memory-card");
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          const textEl = card.querySelector(".memory-card-text");
          const currentText = textEl?.textContent || "";
          openEditorView(`Memory Block #${idx + 1}`, `
          <textarea class="editor-mem-text input-dark" rows="10" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);color:var(--text-primary);border-radius:6px;padding:6px;font-size:11.5px;line-height:1.4;resize:vertical;font-family:inherit;"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button class="editor-save-aid-mem action-btn" style="background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3);">Save</button>
          </div>
        `, (body) => {
            const ta = body.querySelector(".editor-mem-text");
            if (ta) {
              ta.value = currentText;
              ta.focus();
            }
            body.querySelector(".editor-save-aid-mem")?.addEventListener("click", () => {
              const newText = (ta?.value || "").trim();
              if (newText && lastState?.aidMemories) {
                const updatedMemories = [...lastState.aidMemories];
                const item = updatedMemories[idx];
                if (item) {
                  updatedMemories[idx] = {
                    actionIds: item.actionIds || [],
                    text: newText,
                    lastRelevantActionId: item.lastRelevantActionId
                  };
                  cbs.updateAidMemories?.(updatedMemories);
                }
              }
              closeEditorView();
            });
          });
          return;
        }
        const deleteBtn = target.closest(".mem-delete-btn");
        if (deleteBtn) {
          const card = deleteBtn.closest(".memory-card");
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          if (lastState?.aidMemories) {
            const updatedMemories = [...lastState.aidMemories];
            updatedMemories.splice(idx, 1);
            cbs.updateAidMemories?.(updatedMemories);
          }
          return;
        }
        const refineBtn = target.closest(".mem-refine-btn");
        if (refineBtn) {
          const card = refineBtn.closest(".memory-card");
          const idx = parseInt(card.getAttribute("data-idx"), 10);
          const btn = refineBtn;
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.title = "Regenerating...";
          refineMemoryBlockCb?.(idx);
          return;
        }
      });
    }
    $("revert-prompt").addEventListener("click", () => {
      root.getElementById("prompt-s1").value = DEFAULT_PROMPT_SECTION_1;
      root.getElementById("prompt-s2").value = DEFAULT_PROMPT_SECTION_2;
      root.getElementById("prompt-s3").value = DEFAULT_PROMPT_SECTION_3;
      root.getElementById("prompt-s4").value = DEFAULT_PROMPT_SECTION_4;
      for (const k of TYPE_KEYS) {
        const el = root.getElementById("cc-" + k);
        if (el) el.value = DEFAULT_CARD_COMMANDS[k] ?? "";
      }
      const fmtEl = root.getElementById("fmt-mode");
      if (fmtEl) fmtEl.value = DEFAULT_FORMATTING_MODE;
    });
    let refineMemoryBlockCb = null;
    let lastDebug = null;
    const onResultsClick = (e) => {
      const target = e.target;
      const an = target.closest("#an");
      if (an && cbs.analyze) {
        showAnalyzeView();
        setAnalyzeLoading();
        cbs.analyze();
        return;
      }
      const gen = target.closest("[data-gen-card]");
      if (gen && cbs.generateCard) {
        const cardId = gen.getAttribute("data-gen-card");
        if (cardId) {
          gen.disabled = true;
          gen.textContent = "\u23F3 Generating via AID\u2026";
          cbs.generateCard(cardId);
        }
        return;
      }
      const genc = target.closest("[data-gen-compact]");
      if (genc && cbs.generateCompactCard) {
        const cardId = genc.getAttribute("data-gen-compact");
        if (cardId) {
          genc.disabled = true;
          genc.textContent = "\u23F3 Compacting\u2026";
          cbs.generateCompactCard(cardId);
        }
        return;
      }
      const reroll = target.closest("[data-reroll-card]");
      if (reroll && cbs.rerollAppearance) {
        const cardId = reroll.getAttribute("data-reroll-card");
        if (cardId) {
          reroll.disabled = true;
          reroll.textContent = "\u23F3 Re-rolling\u2026";
          cbs.rerollAppearance(cardId);
        }
        return;
      }
      const distill = target.closest(".distill-now-btn");
      if (distill && cbs.distillCrystallized) {
        const cardId = distill.getAttribute("data-card-id");
        const charName = distill.getAttribute("data-char-name");
        if (cardId && charName) {
          distill.disabled = true;
          distill.textContent = "\u23F3 Distilling...";
          cbs.distillCrystallized(cardId, charName);
        }
        return;
      }
      const backfillNpc = target.closest(".backfill-npc-memories-btn");
      if (backfillNpc && cbs.backfillNpcMemories) {
        const charName = backfillNpc.getAttribute("data-char-name");
        if (charName) {
          backfillNpc.disabled = true;
          backfillNpc.textContent = "\u23F3 Backfilling...";
          cbs.backfillNpcMemories(charName);
          if (npcBackfillWatchdog) clearTimeout(npcBackfillWatchdog);
          npcBackfillWatchdog = setTimeout(() => {
            npcBackfillWatchdog = null;
            refreshOpenNpcBankList(charName);
            panelHandle.showToast(`Backfill for ${charName} stopped responding \u2014 refresh to see what landed.`, true);
          }, 6e4);
        }
        return;
      }
      const npcMemRegen = target.closest(".npc-mem-regen-btn");
      if (npcMemRegen && cbs.regenerateNpcMemoryBlock) {
        const charName = npcMemRegen.getAttribute("data-char");
        const blockId = npcMemRegen.getAttribute("data-block-id");
        if (charName && blockId) {
          const btn = npcMemRegen;
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.title = "Regenerating\u2026";
          cbs.regenerateNpcMemoryBlock(charName, blockId).then((res) => {
            const b = res?.block;
            const cardEl = npcMemRegen.closest(".npc-mem-block");
            if (b && cardEl) {
              const textEl = cardEl.querySelector(".memory-card-text");
              if (textEl) textEl.textContent = b.povText;
              const key = charName.toLowerCase();
              const cached = npcMemoryCache.get(key);
              if (cached) {
                const i = cached.findIndex((x) => x.blockId === blockId);
                if (i >= 0) cached[i] = b;
              }
            }
            btn.disabled = false;
            btn.style.opacity = "";
            btn.title = "Regenerate this memory";
          }).catch(() => {
            btn.disabled = false;
            btn.style.opacity = "";
          });
        }
        return;
      }
      const npcMemEdit = target.closest(".npc-mem-edit-btn");
      if (npcMemEdit) {
        const cardEl = npcMemEdit.closest(".npc-mem-block");
        const textEl = cardEl?.querySelector(".memory-card-text");
        const charName = cardEl?.getAttribute("data-char");
        const blockId = cardEl?.getAttribute("data-block-id");
        if (cardEl && textEl && charName && blockId) {
          const cur = textEl.textContent || "";
          openEditorView(`${charName} \u2014 Memory`, `
          <textarea class="editor-mem-text input-dark" rows="10" style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);color:var(--text-primary);border-radius:6px;padding:6px;font-size:11.5px;line-height:1.4;resize:vertical;font-family:inherit;"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button class="editor-save-npc-mem action-btn" style="background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3);">Save</button>
          </div>
        `, (body) => {
            const ta = body.querySelector(".editor-mem-text");
            if (ta) {
              ta.value = cur;
              ta.focus();
            }
            body.querySelector(".editor-save-npc-mem")?.addEventListener("click", async (ev) => {
              const btn = ev.currentTarget;
              const newText = (ta?.value || "").trim();
              if (!newText || !cbs.saveNpcMemoryBlock) return;
              btn.disabled = true;
              btn.textContent = "\u23F3 Saving...";
              try {
                const r = await cbs.saveNpcMemoryBlock(charName, blockId, newText);
                if (r?.error) throw new Error(r.error);
                const key = charName.toLowerCase();
                const cached = npcMemoryCache.get(key);
                if (cached) {
                  const i = cached.findIndex((x) => x.blockId === blockId);
                  if (i >= 0) cached[i] = { ...cached[i], povText: newText };
                }
                showToast("Memory updated.");
                goEditorBack();
              } catch (err) {
                showToast(err?.message || String(err), true);
                btn.disabled = false;
                btn.textContent = "Save";
              }
            });
          }, () => openNpcBankView(charName));
        }
        return;
      }
      const npcMemDel = target.closest(".npc-mem-delete-btn");
      if (npcMemDel && cbs.deleteNpcMemoryBlock) {
        const charName = npcMemDel.getAttribute("data-char");
        const blockId = npcMemDel.getAttribute("data-block-id");
        if (charName && blockId) {
          cbs.deleteNpcMemoryBlock(charName, blockId).then(() => {
            npcMemDel.closest(".npc-mem-block")?.remove();
            const key = charName.toLowerCase();
            const cached = npcMemoryCache.get(key);
            if (cached) npcMemoryCache.set(key, cached.filter((x) => x.blockId !== blockId));
          });
        }
        return;
      }
      const mbSubtab = target.closest(".subtab-btn[data-mbtab]");
      if (mbSubtab) {
        const which = mbSubtab.getAttribute("data-mbtab");
        root.querySelectorAll(".subtab-btn[data-mbtab]").forEach((b) => b.classList.toggle("active", b === mbSubtab));
        root.querySelectorAll(".mb-pane").forEach((p) => {
          p.style.display = p.id === which ? "flex" : "none";
        });
        return;
      }
      const consolidateOutlook = target.closest(".consolidate-outlook-btn");
      if (consolidateOutlook && cbs.consolidateOutlook) {
        const charName = consolidateOutlook.getAttribute("data-char-name");
        if (charName) {
          consolidateOutlook.disabled = true;
          consolidateOutlook.textContent = "\u23F3 Consolidating...";
          cbs.consolidateOutlook(charName);
        }
        return;
      }
      const del = target.closest(".card-delete-btn");
      if (del && cbs.deleteStoryCard) {
        const cardId = del.getAttribute("data-card-id");
        if (!cardId) return;
        if (del.classList.contains("armed")) {
          del.classList.remove("armed");
          del.disabled = true;
          del.textContent = "\u23F3 Deleting\u2026";
          cbs.deleteStoryCard(cardId).then((res) => {
            if (res?.error) {
              showToast(res.error, true);
              del.disabled = false;
              del.textContent = "Delete";
            } else {
              showToast("Card deleted.");
            }
          }).catch((err) => {
            showToast(err?.message || String(err), true);
            del.disabled = false;
            del.textContent = "Delete";
          });
        } else {
          del.classList.add("armed");
          del.textContent = "Confirm delete?";
          setTimeout(() => {
            if (del.classList.contains("armed")) {
              del.classList.remove("armed");
              del.textContent = "Delete";
            }
          }, 3e3);
        }
        return;
      }
      const openCardEditor = target.closest(".open-card-editor");
      if (openCardEditor) {
        const cardId = openCardEditor.getAttribute("data-card-id");
        const card = cardId ? lastState?.cards?.find((c) => c.id === cardId) : void 0;
        if (cardId && card) {
          const origKeys = card.keys || "";
          const origValue = card.value || "";
          openEditorView(card.title || "Card", `
          <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;">Triggers</label>
          <input class="editor-keys input-dark" type="text" value="${esc(origKeys)}" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:6px 8px;border-radius:6px;font-size:11.5px;" />
          <label style="font-weight:700;color:var(--text-secondary);font-size:10px;text-transform:uppercase;margin-top:6px;">Entry</label>
          <textarea class="editor-entry input-dark" rows="14" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:6px 8px;border-radius:6px;font-size:11.5px;font-family:SFMono-Regular,Consolas,monospace;resize:vertical;">${esc(origValue)}</textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button class="editor-save-card action-btn" style="background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3);">Save</button>
          </div>
        `, (body) => {
            body.querySelector(".editor-save-card")?.addEventListener("click", async (ev) => {
              const btn = ev.currentTarget;
              const newKeys = body.querySelector(".editor-keys")?.value.trim() ?? origKeys;
              const newValue = body.querySelector(".editor-entry")?.value.trim() ?? origValue;
              btn.disabled = true;
              btn.textContent = "\u23F3 Saving...";
              try {
                if (newKeys !== origKeys && cbs.saveCardKeys) {
                  const r = await cbs.saveCardKeys(cardId, newKeys);
                  if (r?.error) throw new Error(r.error);
                }
                if (newValue !== origValue && cbs.saveCardValue) {
                  const r = await cbs.saveCardValue(cardId, newValue);
                  if (r?.error) throw new Error(r.error);
                }
                showToast("Card updated.");
                closeEditorView();
              } catch (err) {
                showToast(err?.message || String(err), true);
                btn.disabled = false;
                btn.textContent = "Save";
              }
            });
          });
        }
        return;
      }
      const consolidate = target.closest(".consolidate-crystallized-btn");
      if (consolidate && cbs.consolidateCrystallized) {
        const cardId = consolidate.getAttribute("data-card-id");
        if (cardId) {
          const btn = consolidate;
          btn.disabled = true;
          btn.textContent = "\u23F3 Consolidating...";
          cbs.consolidateCrystallized(cardId).then((res) => {
            if (!res?.error) crystallizedSchemaCache.delete(cardId);
          }).catch((err) => {
            showToast(err?.message || String(err), true);
          }).finally(() => {
            btn.disabled = false;
            btn.textContent = "Consolidate";
          });
        }
        return;
      }
      const openKnows = target.closest(".open-knows-editor");
      if (openKnows) {
        const cardId = openKnows.getAttribute("data-card-id");
        const charName = openKnows.getAttribute("data-char") || "NPC";
        if (cardId) {
          const card = lastState?.cards?.find((c) => c.id === cardId);
          const schemaItems = crystallizedSchemaCache.get(cardId) || parseCrystallized(card?.description).schema;
          openEditorView(`${charName} \u2014 Knows`, buildKnowsEditorHtml(cardId, schemaItems));
        }
        return;
      }
      const openPrefs = target.closest(".open-prefs-editor");
      if (openPrefs) {
        const cardId = openPrefs.getAttribute("data-card-id");
        const charName = openPrefs.getAttribute("data-char") || "NPC";
        if (cardId) {
          const prefTexts = crystallizedPreferencesCache.get(cardId) || [];
          openEditorView(`${charName} \u2014 Preferences`, buildPreferencesEditorHtml(cardId, prefTexts));
        }
        return;
      }
      const openBank = target.closest(".open-npc-bank");
      if (openBank) {
        const charName = openBank.getAttribute("data-char");
        if (charName) openNpcBankView(charName);
        return;
      }
      const knowsAdd = target.closest(".knows-add");
      if (knowsAdd) {
        const cardId = knowsAdd.getAttribute("data-card-id");
        if (cardId) {
          const editor = knowsAdd.closest(".knows-editor");
          const container = editor?.querySelector(".knows-rows-container");
          if (container) {
            const idx = container.querySelectorAll(".knows-row").length;
            const div = document.createElement("div");
            div.className = "knows-row";
            div.setAttribute("data-idx", String(idx));
            div.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;";
            setSafeHTML(div, `
            <div style="display:flex;gap:6px;align-items:center;">
              <input class="knows-canon input-compact input-dark" value="" placeholder="Subject" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
              <input class="knows-aliases input-compact input-dark" value="" placeholder="aka (comma-separated)" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
              <button class="knows-del" data-idx="${idx}" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border:1px solid rgba(239, 68, 68, 0.3);border-radius:4px;cursor:pointer;padding:2px 6px;font-size:11px;">\u2715</button>
            </div>
            <textarea class="knows-text input-dark" rows="2" style="background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;font-family:inherit;resize:vertical;"></textarea>
          `);
            container.appendChild(div);
          }
        }
        return;
      }
      const knowsDel = target.closest(".knows-del");
      if (knowsDel) {
        const row = knowsDel.closest(".knows-row");
        row?.remove();
        return;
      }
      const knowsSave = target.closest(".knows-save");
      if (knowsSave && cbs.saveCrystallizedSchema) {
        const cardId = knowsSave.getAttribute("data-card-id");
        if (cardId) {
          const editor = knowsSave.closest(".knows-editor");
          if (editor) {
            const rows = Array.from(editor.querySelectorAll(".knows-row"));
            const schema = rows.map((r) => ({
              subject: r.querySelector(".knows-canon")?.value.trim() || "",
              aliases: r.querySelector(".knows-aliases")?.value.split(",").map((s) => s.trim()).filter(Boolean) || [],
              text: r.querySelector(".knows-text")?.value.trim() || ""
            })).filter((s) => s.subject && s.text);
            const btn = knowsSave;
            btn.disabled = true;
            btn.textContent = "\u23F3 Saving...";
            cbs.saveCrystallizedSchema(cardId, schema).then((res) => {
              if (res?.error) {
                showToast(res.error, true);
              } else {
                crystallizedSchemaCache.set(cardId, schema);
              }
            }).catch((err) => {
              showToast(err?.message || String(err), true);
            }).finally(() => {
              btn.disabled = false;
              btn.textContent = "Save Knows";
            });
          }
        }
        return;
      }
      const prefsAdd = target.closest(".prefs-add");
      if (prefsAdd) {
        const cardId = prefsAdd.getAttribute("data-card-id");
        if (cardId) {
          const editor = prefsAdd.closest(".prefs-editor");
          const container = editor?.querySelector(".prefs-rows-container");
          if (container) {
            const div = document.createElement("div");
            setSafeHTML(div, prefRowHtml(""));
            const row = div.firstElementChild;
            if (row) {
              container.appendChild(row);
              row.querySelector(".pref-text")?.focus();
            }
          }
        }
        return;
      }
      const prefsDel = target.closest(".pref-del");
      if (prefsDel) {
        prefsDel.closest(".pref-row")?.remove();
        return;
      }
      const prefsSave = target.closest(".prefs-save");
      if (prefsSave && cbs.savePreferences) {
        const cardId = prefsSave.getAttribute("data-card-id");
        if (cardId) {
          const editor = prefsSave.closest(".prefs-editor");
          if (editor) {
            const prefs = Array.from(editor.querySelectorAll(".pref-text")).map((t2) => t2.value.trim()).filter(Boolean);
            const btn = prefsSave;
            btn.disabled = true;
            btn.textContent = "\u23F3 Saving...";
            cbs.savePreferences(cardId, prefs).then((res) => {
              if (res?.error) {
                showToast(res.error, true);
              } else {
                crystallizedPreferencesCache.set(cardId, prefs);
              }
            }).catch((err) => {
              showToast(err?.message || String(err), true);
            }).finally(() => {
              btn.disabled = false;
              btn.textContent = "Save Preferences";
            });
          }
        }
        return;
      }
      const memoraidSave = target.closest(".memoraid-save-btn");
      if (memoraidSave && cbs.setMemoraidCharacters) {
        const inputEl = results.querySelector(".memoraid-chars-input");
        const names = (inputEl?.value || "").split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
        const btn = memoraidSave;
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = "\u23F3 Saving...";
        cbs.setMemoraidCharacters(names).then((res) => {
          if (res?.error) showToast(res.error, true);
          else showToast("MemorAID characters saved!");
        }).catch((err) => {
          showToast(err?.message || String(err), true);
        }).finally(() => {
          btn.disabled = false;
          btn.textContent = orig || "\u{1F4BE} Save Characters";
        });
        return;
      }
      const t = target.closest("[data-act]");
      if (!t) return;
      const vid = t.getAttribute("data-vid");
      const act = t.getAttribute("data-act");
      console.log("[AID panel] Click detected. act:", act, "vid:", vid);
      if (vid && (act === "applied" || act === "rejected") && cbs.proposalDecision) {
        console.log("[AID panel] Triggering cbs.proposalDecision for vid:", vid, "act:", act);
        cbs.proposalDecision(vid, act);
      }
      if (vid && act === "push" && cbs.pushVersion) {
        console.log("[AID panel] Triggering cbs.pushVersion (onPushVersion) for vid:", vid);
        cbs.pushVersion(vid);
      }
    };
    results.addEventListener("click", onResultsClick);
    {
      const mbPaneEl = root.getElementById("main-tab-memories");
      if (mbPaneEl) mbPaneEl.addEventListener("click", onResultsClick);
    }
    {
      const editorBodyEl = root.getElementById("editor-body");
      if (editorBodyEl) editorBodyEl.addEventListener("click", onResultsClick);
    }
    analyzeBody.addEventListener("click", (e) => {
      const t = e.target.closest("[data-act]");
      if (!t) return;
      const vid = t.getAttribute("data-vid");
      const act = t.getAttribute("data-act");
      if (vid && (act === "applied" || act === "rejected") && cbs.proposalDecision) {
        cbs.proposalDecision(vid, act);
        const actions = t.closest("[data-prop]")?.querySelector(".prop-actions");
        if (actions) setSafeHTML(actions, act === "applied" ? `<span class="note" style="color:var(--accent-color);font-weight:600;">\u2713 Accepted</span>` : `<span class="note" style="color:#f87171;">Rejected</span>`);
      }
    });
    function esc(s) {
      return s.replace(/[\u0026\u003c\u003e\u0022]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    }
    function doesDetailMatchQuestion(key, question) {
      const k = key.toLowerCase();
      const q = question.toLowerCase();
      if (q.includes(k)) return true;
      if (k === "age" && (q.includes("old") || q.includes("years"))) return true;
      if (k === "gender" && (q.includes("sex") || q.includes("male") || q.includes("female"))) return true;
      if (k === "name" && (q.includes("who are you") || q.includes("called") || q.includes("identity"))) return true;
      return false;
    }
    function renderSetupFavorites(globalAssets, filterText = "", activeQuestion = "", existingContainer) {
      const filtered = (globalAssets ?? []).filter((a) => {
        if (a.type !== "pe") return false;
        if (filterText) {
          const matchText = filterText.toLowerCase();
          return (a.title || "").toLowerCase().includes(matchText) || (a.keys || "").toLowerCase().includes(matchText) || (a.value || "").toLowerCase().includes(matchText);
        }
        return true;
      });
      filtered.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      if (filtered.length === 0) {
        return `<div style="text-align:center; padding:12px; color:var(--text-secondary); font-size:11px;">No favorite characters found.</div>`;
      }
      const existingFavIds = /* @__PURE__ */ new Set();
      const openFavIds = /* @__PURE__ */ new Set();
      const container = existingContainer || root.getElementById("setup-favorites-list");
      if (container) {
        container.querySelectorAll(".setup-fav-drawer").forEach((el) => {
          const id = el.getAttribute("data-id");
          if (id) {
            existingFavIds.add(id);
            if (el.open) {
              openFavIds.add(id);
            }
          }
        });
      }
      return filtered.map((a) => {
        const icon = "\u{1F464}";
        const typeLabel = "Bio";
        const details = extractDetailsFromText(a.value).concat(extractDetailsFromText(a.description || ""));
        details.unshift({ key: "Name", value: a.title });
        const seenKeys = /* @__PURE__ */ new Set();
        const uniqueDetails = details.filter((d) => {
          const k = d.key.toLowerCase();
          if (seenKeys.has(k)) return false;
          seenKeys.add(k);
          return true;
        });
        const chipsHtml = uniqueDetails.map((d) => {
          const isMatch = doesDetailMatchQuestion(d.key, activeQuestion);
          const style = isMatch ? "background:rgba(168,85,247,0.25); color:#d8b4fe; border:1px solid rgba(168,85,247,0.5); font-weight:600; box-shadow:0 0 4px rgba(168,85,247,0.2);" : "background:rgba(255,255,255,0.04); color:var(--text-secondary); border:1px solid rgba(255,255,255,0.06);";
          return `
          <span class="setup-detail-chip" data-key="${esc(d.key)}" data-value="${esc(d.value)}" style="padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer; max-width:100%; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; transition:all 0.15s ease; ${style}" title="Click to fill: ${esc(d.value)}">
            ${esc(d.key)}: ${esc(d.value)}
          </span>
        `;
        }).join("");
        const wasPresent = existingFavIds.has(a.id);
        const isOpen = wasPresent ? openFavIds.has(a.id) : !!(activeQuestion && uniqueDetails.some((d) => doesDetailMatchQuestion(d.key, activeQuestion)));
        return `
        <details class="char-card setup-fav-drawer" data-id="${esc(a.id)}" ${isOpen ? "open" : ""}>
          <summary>
            <span>
              ${icon} ${esc(a.title)}
              <span style="color:var(--text-secondary);font-size:10.5px;font-weight:normal;margin-left:4px;">
                (${esc(typeLabel)}${a.description || a.keys ? ` - ${esc(a.description || a.keys || "")}` : ""})
              </span>
            </span>
          </summary>
          <div class="char-card-body" style="background:rgba(0,0,0,0.15); border-top:1px solid rgba(255,255,255,0.04);">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:9.5px; color:var(--text-secondary);">
              <span>Quick Fill:</span>
              <div style="display:flex; gap:4px;">
                <button class="setup-fill-btn fill-name" data-id="${esc(a.id)}" style="margin:0; padding:2px 6px; font-size:9px; background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3); border-radius:4px; cursor:pointer;" title="Fill character name">Name</button>
                <button class="setup-fill-btn fill-bio" data-id="${esc(a.id)}" style="margin:0; padding:2px 6px; font-size:9px; background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3); border-radius:4px; cursor:pointer;" title="Fill character entry/bio">Full Bio</button>
              </div>
            </div>
            ${chipsHtml ? `
              <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
                ${chipsHtml}
              </div>
            ` : ""}
          </div>
        </details>
      `;
      }).join("");
    }
    function buildCardPickerOptions(cards) {
      const TYPE_LABELS = { character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions", custom: "Custom" };
      const byType = /* @__PURE__ */ new Map();
      for (const c of cards ?? []) {
        if (c.deletedAt) continue;
        const t = (c.type || "custom").toLowerCase();
        const arr = byType.get(t) ?? [];
        arr.push({ id: c.id, label: c.title || c.keys || "(untitled)" });
        byType.set(t, arr);
      }
      const order = ["character", "location", "faction", "class", "race", "custom"];
      const orderedTypes = [...byType.keys()].sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
      });
      let html = `<option value="" selected>-- existing card --</option>`;
      for (const t of orderedTypes) {
        const label = TYPE_LABELS[t] ?? t;
        const opts = byType.get(t).sort((a, b) => a.label.localeCompare(b.label));
        html += `<optgroup label="${esc(label)}">` + opts.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("") + `</optgroup>`;
      }
      return html;
    }
    function buildTypePickerOptions(cards, selected) {
      const base = [
        ["", "None"],
        ["character", "Character"],
        ["class", "Class"],
        ["race", "Race"],
        ["location", "Location"],
        ["faction", "Faction"],
        ["custom", "Custom"]
      ];
      const reserved = /* @__PURE__ */ new Set(["", "character", "class", "race", "location", "faction", "custom", "memory"]);
      const sel = (selected || "").trim().toLowerCase();
      const customTypes = [];
      const seen = /* @__PURE__ */ new Set();
      for (const c of cards ?? []) {
        if (c.deletedAt) continue;
        const t = (c.type || "").trim();
        const tl = t.toLowerCase();
        if (!t || reserved.has(tl) || seen.has(tl)) continue;
        seen.add(tl);
        customTypes.push(t);
      }
      customTypes.sort((a, b) => a.localeCompare(b));
      let html = base.map(([v, l]) => `<option value="${esc(v)}"${sel === v ? " selected" : ""}>${esc(l)}</option>`).join("");
      if (customTypes.length) {
        html += `<optgroup label="Detected Custom Types">` + customTypes.map((t) => `<option value="${esc(t)}"${sel === t.toLowerCase() ? " selected" : ""}>${esc(t)}</option>`).join("") + `</optgroup>`;
      }
      return html;
    }
    function showAnalyzeResultFn(res) {
      if (!res) {
        setSafeHTML(analyzeBody, `<div class="note">No response.</div>`);
        return;
      }
      if (res.error) {
        setSafeHTML(analyzeBody, `<div style="padding:12px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.06);border-radius:8px;color:#fca5a5;font-size:12px;">${esc(res.error)}</div><button id="analyze-done" style="margin-top:12px;width:100%;background:var(--btn-bg);border:1px solid var(--border-color);color:var(--text-primary);font-weight:600;padding:6px;border-radius:6px;">\u2190 Back to Tracker</button>`);
        root.getElementById("analyze-done")?.addEventListener("click", showTrackerView);
        return;
      }
      const count2 = res.count ?? 0;
      const proposals = res.proposals ?? [];
      let html = `<div style="font-weight:700;color:var(--accent-color);font-size:14px;margin-bottom:8px;">${count2} proposal${count2 === 1 ? "" : "s"}</div>`;
      if (count2 === 0) {
        html += `<div class="note" style="padding:10px;border:1px solid var(--border-color);border-radius:8px;">No changes detected \u2014 everything is already up to date.</div>`;
      } else {
        html += proposals.map(
          (p) => `<div class="prop" data-prop><div class="sum">${esc(p.characterName)}</div><div style="color:#9fd;font-size:11px;margin:2px 0 4px;">${esc(p.changeSummary)}</div><details><summary style="color:var(--accent-color);">view proposed entry</summary><div class="code-card"><pre>${esc(p.entry)}</pre></div></details><div class="prop-actions" style="margin-top:6px;"><button data-vid="${esc(p.id)}" data-act="applied" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);padding:3px 10px;border-radius:6px;font-size:10px;margin-right:4px;">Accept</button><button data-vid="${esc(p.id)}" data-act="rejected" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:3px 10px;border-radius:6px;font-size:10px;">Reject</button></div></div>`
        ).join("");
      }
      if (res.warnings?.length) {
        html += `<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--text-secondary);font-size:11px;">${res.warnings.length} warning(s)</summary><ul style="margin:4px 0;padding-left:18px;">` + res.warnings.map((w) => `<li class="note" style="margin:2px 0;">${esc(w)}</li>`).join("") + `</ul></details>`;
      }
      html += `<button id="analyze-done" class="btn-primary" style="margin-top:12px;width:100%;padding:6px;">View Tracker</button>`;
      setSafeHTML(analyzeBody, html);
      root.getElementById("analyze-done")?.addEventListener("click", showTrackerView);
    }
    function buildKnowsEditorHtml(genCardId, schemaItems) {
      return `<div class="knows-editor" data-card-id="${esc(genCardId)}" style="margin-top:6px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;"><div class="knows-rows-container">` + schemaItems.map((item, idx) => `
        <div class="knows-row" data-idx="${idx}" style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:6px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:6px;">
          <div style="display:flex;gap:6px;align-items:center;">
            <input class="knows-canon input-compact input-dark" value="${esc(item.subject)}" placeholder="Subject" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
            <input class="knows-aliases input-compact input-dark" value="${esc((item.aliases || []).join(", "))}" placeholder="aka (comma-separated)" style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;" />
            <button class="knows-del" data-idx="${idx}" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border:1px solid rgba(239, 68, 68, 0.3);border-radius:4px;cursor:pointer;padding:2px 6px;font-size:11px;">\u2715</button>
          </div>
          <textarea class="knows-text input-dark" rows="2" style="background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;font-family:inherit;resize:vertical;">${esc(item.text)}</textarea>
        </div>
      `).join("") + `</div><div style="display:flex;gap:8px;margin-top:8px;"><button class="knows-add action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(255,255,255,0.04);color:var(--text-primary);border-color:var(--border-color);">+ Add subject</button><button class="knows-save action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);">Save Knows</button></div></div>`;
    }
    function prefRowHtml(text) {
      return `<div class="pref-row" style="display:flex;gap:6px;align-items:flex-start;margin-bottom:6px;">
        <textarea class="pref-text input-dark" rows="2" placeholder="e.g. I hate olives. / I love old Audis. / I don't really have an opinion on breadsticks." style="flex:1;background:rgba(255,255,255,0.03);color:var(--text-primary);border:1px solid rgba(255,255,255,0.08);padding:4px 6px;border-radius:4px;font-size:11px;font-family:inherit;resize:vertical;">${esc(text)}</textarea>
        <button class="pref-del" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border:1px solid rgba(239, 68, 68, 0.3);border-radius:4px;cursor:pointer;padding:2px 6px;font-size:11px;">\u2715</button>
      </div>`;
    }
    function buildPreferencesEditorHtml(genCardId, prefTexts) {
      return `<div class="prefs-editor" data-card-id="${esc(genCardId)}" style="margin-top:6px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;"><div class="note" style="margin-bottom:6px;font-size:10px;color:var(--text-secondary);">Tastes, habits, quirks, pet peeves, opinions about things \u2014 positive, negative, or neutral. These never fade; they're pulled in when the scene is relevant. Seed as many as you like.</div><div class="prefs-rows-container">` + (prefTexts.length ? prefTexts.map((t) => prefRowHtml(t)).join("") : "") + `</div><div style="display:flex;gap:8px;margin-top:8px;"><button class="prefs-add action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(255,255,255,0.04);color:var(--text-primary);border-color:var(--border-color);">+ Add preference</button><button class="prefs-save action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);">Save Preferences</button></div></div>`;
    }
    function renderNpcMemBlockHtml(charName, b) {
      const c = esc(charName);
      const id = esc(b.blockId);
      return `<div class="npc-mem-block memory-card" data-char="${c}" data-block-id="${id}" data-turn-end="${b.turnEnd}">
        <div class="memory-card-header">
          <div style="display:flex;align-items:center;color:var(--text-secondary);font-size:10px;">turns ${b.turnStart}\u2013${b.turnEnd}</div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="npc-mem-regen-btn btn-icon" data-char="${c}" data-block-id="${id}" style="color:#eab308;" title="Regenerate this memory">
              <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>
            </button>
            <button class="npc-mem-edit-btn btn-icon" title="Edit memory">
              <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c0.39-0.39 0.39-1.02 0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="npc-mem-delete-btn btn-icon" data-char="${c}" data-block-id="${id}" style="color:#f87171;" title="Delete memory">
              <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        <div class="memory-card-text">${esc(b.povText)}</div>
      </div>`;
    }
    function renderNpcMemList(charName) {
      const key = charName.toLowerCase();
      const blocks = npcMemoryCache.get(key);
      if (!blocks) {
        if (!npcMemoryFetching.has(key) && cbs.getNpcMemoryBank) {
          npcMemoryFetching.add(key);
          cbs.getNpcMemoryBank(charName).then((res) => {
            npcMemoryCache.set(key, res?.blocks || []);
            refreshOpenNpcBankList(charName);
          }).catch(() => {
          }).finally(() => npcMemoryFetching.delete(key));
        }
        return `<div class="note" style="padding:6px;">Loading\u2026</div>`;
      }
      if (!blocks.length) return `<div class="note" style="padding:6px;">No memories yet \u2014 use \u201CBackfill memories\u201D.</div>`;
      return blocks.map((b) => renderNpcMemBlockHtml(charName, b)).join("");
    }
    function refreshOpenNpcBankList(charName) {
      const body = root.getElementById("editor-body");
      if (!body) return;
      const list = Array.from(body.querySelectorAll(".npc-mem-list")).find((el) => el.getAttribute("data-char") === charName);
      if (list) setSafeHTML(list, renderNpcMemList(charName));
    }
    function openNpcBankView(charName) {
      openEditorView(
        `${charName} \u2014 Memory Bank`,
        `<div style="display:flex;gap:6px;flex-shrink:0;"><button class="backfill-npc-memories-btn btn-micro btn-micro--green" data-char-name="${esc(charName)}" title="Generate this character's point-of-view memories from the adventure's native memory blocks">Backfill memories</button></div><div class="npc-mem-list" data-char="${esc(charName)}" style="display:flex;flex-direction:column;gap:8px;">${renderNpcMemList(charName)}</div>`
      );
    }
    function insertNpcMemBlock(charName, block) {
      const key = charName.toLowerCase();
      const cached = npcMemoryCache.get(key);
      if (cached && !cached.some((b) => b.blockId === block.blockId)) {
        cached.push(block);
        cached.sort((a, b) => b.turnEnd - a.turnEnd);
      }
      const pane = root.getElementById("editor-body");
      if (!pane) return false;
      let list = null;
      pane.querySelectorAll(".npc-mem-list").forEach((el) => {
        if (el.getAttribute("data-char") === charName) list = el;
      });
      if (!list) return false;
      const listEl = list;
      if (listEl.querySelector(`.npc-mem-block[data-block-id="${block.blockId.replace(/"/g, '\\"')}"]`)) return true;
      const placeholder = listEl.querySelector(".note");
      if (placeholder && listEl.children.length === 1) listEl.textContent = "";
      const frag = document.createElement("div");
      setSafeHTML(frag, renderNpcMemBlockHtml(charName, block));
      const node = frag.firstElementChild;
      if (!node) return true;
      let inserted = false;
      for (const existing of Array.from(listEl.querySelectorAll(":scope > .npc-mem-block"))) {
        const te = Number(existing.getAttribute("data-turn-end") || "0");
        if (block.turnEnd > te) {
          listEl.insertBefore(node, existing);
          inserted = true;
          break;
        }
      }
      if (!inserted) listEl.appendChild(node);
      return true;
    }
    function renderNpcMemoryBank(state) {
      const pane = root.getElementById("mb-npc");
      if (!pane) return;
      const crystCards = (state.cards || []).filter((c) => !c.deletedAt && (c.title || "").toLowerCase().endsWith(" - crystallized"));
      if (!crystCards.length) {
        setSafeHTML(pane, `<div class="note" style="padding:12px;">No Crystallized NPCs yet. Enable Crystallized and add characters in the Card Manager \u2192 MemorAID section.</div>`);
        return;
      }
      const openKeys = /* @__PURE__ */ new Set();
      pane.querySelectorAll("details[data-key]").forEach((d) => {
        if (d.open) openKeys.add(d.getAttribute("data-key") || "");
      });
      let html = "";
      for (const cc of crystCards) {
        const charName = (cc.title || "").replace(/\s*-\s*crystallized$/i, "");
        const genCardId = cc.id;
        const cachedSchema = crystallizedSchemaCache.get(genCardId);
        if (!cachedSchema && !crystallizedSchemaFetching.has(genCardId) && cbs.getCrystallizedSchema) {
          crystallizedSchemaFetching.add(genCardId);
          cbs.getCrystallizedSchema(genCardId).then((res) => {
            if (res?.ok && res.state) {
              crystallizedSchemaCache.set(genCardId, res.state.schema || []);
              crystallizedPreferencesCache.set(genCardId, [...res.state.preferences || []].sort((a, b) => b.strength - a.strength).map((p) => p.text));
              if (lastState) renderNpcMemoryBank(lastState);
            }
          }).catch(() => {
          }).finally(() => crystallizedSchemaFetching.delete(genCardId));
        }
        html += `<details class="char-card" data-key="mbnpc:${esc(charName)}"><summary>${esc(charName)}</summary><div style="display:flex;flex-direction:column;gap:6px;margin:8px 0;"><button class="open-knows-editor npc-section-btn" data-card-id="${esc(genCardId)}" data-char="${esc(charName)}"><span>\u{1F9E0} Knows</span><span class="npc-section-chevron">\u203A</span></button><button class="open-prefs-editor npc-section-btn" data-card-id="${esc(genCardId)}" data-char="${esc(charName)}"><span>\u2728 Preferences</span><span class="npc-section-chevron">\u203A</span></button><button class="open-npc-bank npc-section-btn" data-char="${esc(charName)}"><span>\u{1F4DA} Memory Bank</span><span class="npc-section-chevron">\u203A</span></button></div></details>`;
      }
      setSafeHTML(pane, html);
      pane.querySelectorAll("details[data-key]").forEach((d) => {
        if (openKeys.has(d.getAttribute("data-key") || "")) d.open = true;
      });
    }
    function renderMemoriesSection(state) {
      const refineBtn = root.getElementById("refine-mem");
      if (refineBtn) {
        refineBtn.disabled = false;
        refineBtn.textContent = "\u26A1 Regenerate Latest";
      }
      const memListEl2 = root.getElementById("aid-memories-list");
      if (memListEl2) {
        if (!state.aidMemories || state.aidMemories.length === 0) {
          setSafeHTML(memListEl2, `<div class="note" style="padding:12px;text-align:center;">No AID-generated memories captured yet.</div>`);
        } else {
          const actionMap = /* @__PURE__ */ new Map();
          if (state.actions) {
            for (const a of state.actions) {
              actionMap.set(a.id, a.text || "");
            }
          }
          const isInitialLoad = knownMemories.size === 0;
          const itemsWithIndex = state.aidMemories.map((m, index) => ({ m, index }));
          const reversedItems = [...itemsWithIndex].reverse();
          setSafeHTML(memListEl2, reversedItems.map(({ m, index }) => {
            const text = typeof m === "string" ? m : m?.text || "";
            const rawM = m;
            const isUsed = m && typeof m !== "string" && (rawM.used === true || rawM.isUsed === true || rawM.active === true);
            let statusClass = "stored";
            let statusText = "Stored Context";
            if (isUsed) {
              statusClass = "used";
              statusText = "Used Memory";
            }
            const key = m && typeof m !== "string" && m.actionIds && m.actionIds.length > 0 ? m.actionIds.join(",") : text;
            const isNew = !isInitialLoad && key ? !knownMemories.has(key) : false;
            if (key) {
              knownMemories.add(key);
            }
            const matchedTexts = m && typeof m !== "string" && m.actionIds ? m.actionIds.map((id) => actionMap.get(id)).filter((t) => !!t) : [];
            const contextHtml = matchedTexts.length > 0 ? `<details class="memory-context" style="margin-top:6px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">
                 <summary style="cursor:pointer; color:var(--text-secondary); font-size:10px; outline:none; user-select:none;">View Story Context (${matchedTexts.length} turns)</summary>
                 <div class="code-card" style="margin-top:4px; max-height:120px; overflow-y:auto; font-size:10.5px; line-height:1.4; color:var(--text-secondary); white-space:pre-wrap; background:rgba(0,0,0,0.15); border-radius:4px; padding:6px;">${matchedTexts.map((t) => esc(t)).join("\n\n")}</div>
               </details>` : "";
            return `
            <div class="memory-card ${isNew ? "ping-new" : ""}" data-idx="${index}">
              <div class="memory-card-header">
                <div style="display:flex;align-items:center;">
                  <span class="memory-status-dot ${statusClass}"></span>
                  <span>${statusText}</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                  <button class="mem-refine-btn btn-icon" style="color:#eab308;" title="Regenerate this memory with your provider">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
                    </svg>
                  </button>
                  <button class="mem-edit-btn btn-icon" title="Edit memory">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c0.39-0.39 0.39-1.02 0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>
                  <button class="mem-delete-btn btn-icon" style="color:#f87171;" title="Delete memory">
                    <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="memory-card-text">${esc(text)}</div>
              ${contextHtml}
            </div>
          `;
          }).join(""));
        }
      }
      const memoriesCount = state.aidMemories?.length ?? 0;
      if (lastViewedMemoriesCount === -1) {
        lastViewedMemoriesCount = memoriesCount;
      }
      const badge = root.getElementById("unread-memories-badge");
      if (badge) {
        if (activeTabId === "main-tab-memories") {
          lastViewedMemoriesCount = memoriesCount;
          badge.style.display = "none";
          badge.className = "";
        } else if (memoriesCount > lastViewedMemoriesCount) {
          badge.textContent = `+${memoriesCount - lastViewedMemoriesCount}`;
          badge.style.display = "inline-block";
          badge.className = "badge-new-memories";
        } else {
          badge.style.display = "none";
          badge.className = "";
        }
      }
    }
    const PRESET_MODES = [
      {
        name: "Drama & Tension",
        emoji: "\u{1F3AD}",
        color: "#f97316",
        rgb: "249,115,22",
        tagline: "Heart-pounding conflicts. Shifting alliances. Emotional fireworks.",
        blurb: "Soap-opera twists and love triangles that keep you hooked.",
        pressures: ["jealousy", "betrayal", "suspicion", "envy", "rivalry", "confrontation", "gossip", "misunderstanding", "obsession"],
        spark: "A whispered rumor at the dinner table turns into a thrown glass. By midnight, two best friends are not speaking."
      },
      {
        name: "Romance & Connection",
        emoji: "\u{1F495}",
        color: "#ec4899",
        rgb: "236,72,153",
        tagline: "Slow burns, deep bonds, and feelings that hit hard.",
        blurb: "The kind of tension that makes the story throb.",
        pressures: ["attraction", "seduction", "protectiveness", "curiosity", "trust", "jealousy", "teasing", "longing"],
        spark: "The power cuts out, her hand finds his in the dark, and neither of them lets go first."
      },
      {
        name: "Chaos & High Drama",
        emoji: "\u{1F480}",
        color: "#a855f7",
        rgb: "168,85,247",
        tagline: "Everything spirals into unpredictable intensity.",
        blurb: "Reality-TV levels of 'what the hell just happened?'",
        pressures: ["confrontation", "argument", "suspicion", "narcissism", "overreaction", "paranoia", "betrayal"],
        spark: "An accusation lands wrong, an old text resurfaces, and suddenly everyone is yelling."
      },
      {
        name: "Comedy & Lighthearted",
        emoji: "\u{1F923}",
        color: "#eab308",
        rgb: "234,179,8",
        tagline: "Bursts of absurdity to balance the storm.",
        blurb: "Laughs that make the wild ride even better.",
        pressures: ["awkward", "misunderstanding", "overreaction", "confusion", "silly behavior"],
        spark: "He misheard the question, answered with full confidence, and now the room thinks he is proposing."
      },
      {
        name: "Psychological & Depth",
        emoji: "\u{1F9E0}",
        color: "#22c55e",
        rgb: "34,197,94",
        tagline: "Dive into the hidden mind and soul.",
        blurb: "Stories that crawl under your skin and stay there.",
        pressures: ["guilt", "envy", "obsession", "avoidance", "suspicion", "regret", "curiosity", "possession"],
        spark: "She edits the apology, deletes it, and decides to act like nothing happened. He notices."
      },
      {
        name: "Survival & Challenge",
        emoji: "\u2622\uFE0F",
        color: "#ef4444",
        rgb: "239,68,68",
        tagline: "High-stakes worlds where every choice bites back.",
        blurb: "Gritty, morally gray survival that refuses to let go.",
        pressures: ["scarcity", "resource competition", "paranoia", "betrayal", "self-preservation", "desperation", "territorial behavior", "fear", "mistrust"],
        spark: "Three cans of food left. Four people. By morning, one bed is empty."
      }
    ];
    const CORE_PRESSURES = ["friendship", "trust", "curiosity", "protectiveness", "jealousy", "rivalry", "attraction", "seduction", "teasing"];
    const WILDCARDS = ["yelling", "food fight", "awkward silence", "broken glass", "stolen letter", "wrong name", "thunderstorm", "uninvited guest", "burnt dinner", "midnight knock"];
    function renderLivingCharactersSection(state) {
      if (!state.settings) return;
      const statusBanner = root.getElementById("lc-status-banner");
      if (statusBanner) {
        statusBanner.innerHTML = `
        <div style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:10px; margin-bottom:4px; font-size:11px; line-height:1.4; color:var(--text-secondary);">
          <div style="font-weight:700; color:#10b981; letter-spacing:0.03em; margin-bottom:2px;">\u{1F331} Living Characters by nerdgrl450</div>
          <div>NPC relationship threads (Life Cards) are managed directly by the extension. No AI Dungeon scripting sandbox or config cards are required.</div>
        </div>
      `;
      }
      const rosterEl = root.getElementById("lc-config-roster");
      const pressuresEl = root.getElementById("lc-config-pressures");
      const protagonistEl = root.getElementById("lc-config-protagonist");
      const involvementEl = root.getElementById("lc-config-involvement");
      const intervalEl = root.getElementById("lc-config-interval");
      const maxEl = root.getElementById("lc-config-max");
      const relevanceEl = root.getElementById("lc-config-relevance");
      const dormancyEl = root.getElementById("lc-config-dormancy");
      const reseedEl = root.getElementById("lc-config-reseed-cooldown");
      const staleEl = root.getElementById("lc-config-stale");
      const maxLifetimeEl = root.getElementById("lc-config-max-lifetime");
      const lc = state.livingConfig || {};
      if (rosterEl && root.activeElement !== rosterEl) {
        let rosterText = lc.roster || "";
        if (!rosterText && state.cards) {
          const names = state.cards.filter((c) => !c.deletedAt && normalizeType(c.type) === "character" && !(c.title || "").toLowerCase().endsWith(" (memory)")).map((c) => c.title || "").filter(Boolean);
          rosterText = names.join("\n");
        }
        rosterEl.value = rosterText;
      }
      if (pressuresEl && root.activeElement !== pressuresEl) {
        pressuresEl.value = lc.pressures || DEFAULT_LC_PRESSURES;
      }
      if (protagonistEl && root.activeElement !== protagonistEl) {
        protagonistEl.value = state.protagonist || "";
      }
      if (involvementEl) {
        involvementEl.value = lc.protagonistInvolvement || "normal";
      }
      if (intervalEl && root.activeElement !== intervalEl) {
        intervalEl.value = String(lc.interval ?? 15);
      }
      if (maxEl) {
        maxEl.value = String(lc.maxActive ?? 2);
      }
      if (relevanceEl) {
        relevanceEl.value = lc.sceneRelevance || "strict";
      }
      if (dormancyEl && root.activeElement !== dormancyEl) {
        dormancyEl.value = String(lc.dormancyTurns ?? 7);
      }
      if (reseedEl && root.activeElement !== reseedEl) {
        reseedEl.value = String(lc.reseedCooldown ?? 15);
      }
      if (staleEl && root.activeElement !== staleEl) {
        staleEl.value = String(lc.staleTurns ?? 14);
      }
      if (maxLifetimeEl && root.activeElement !== maxLifetimeEl) {
        maxLifetimeEl.value = String(lc.maxActiveTurns ?? 4);
      }
      const continueModeEl = root.getElementById("lc-config-continue-mode");
      if (continueModeEl) {
        continueModeEl.value = lc.continueInjectionMode || "defer";
      }
      const pairingContainer = root.getElementById("lc-pairing-pools");
      const pairingDatalist = root.getElementById("lc-character-names");
      const addPairingBtn = root.getElementById("lc-add-pairing");
      const pairingRowHtml = (a, b, pressures) => `<div class="lc-pairing-row" style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;"><input class="lc-pair-a input-compact input-dark" list="lc-character-names" placeholder="Character A" value="${esc(a)}" style="flex:1; min-width:78px;" /><span style="opacity:0.55; font-size:11px;">\u2194</span><input class="lc-pair-b input-compact input-dark" list="lc-character-names" placeholder="Character B" value="${esc(b)}" style="flex:1; min-width:78px;" /><input class="lc-pair-pressures input-compact input-dark" placeholder="romance, devotion" value="${esc(pressures)}" style="flex:2; min-width:110px;" /><button class="lc-pairing-del" title="Remove pairing" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3); border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; min-height:unset; width:auto;">\u2715</button></div>`;
      if (pairingDatalist) {
        const names = /* @__PURE__ */ new Set();
        (lc.roster || "").split("\n").map((n) => n.trim()).filter(Boolean).forEach((n) => names.add(n));
        (state.cards || []).filter((c) => !c.deletedAt && normalizeType(c.type) === "character" && !(c.title || "").toLowerCase().endsWith(" (memory)")).forEach((c) => {
          if (c.title) names.add(c.title);
        });
        if (state.protagonist) names.add(state.protagonist);
        setSafeHTML(pairingDatalist, Array.from(names).map((n) => `<option value="${esc(n)}"></option>`).join(""));
      }
      if (pairingContainer && !pairingContainer.contains(root.activeElement)) {
        const pairs = lc.pressurePairs || [];
        setSafeHTML(pairingContainer, pairs.map((p) => pairingRowHtml(p.a || "", p.b || "", (p.pressures || []).join(", "))).join(""));
      }
      if (addPairingBtn && !addPairingBtn.dataset.lcWired) {
        addPairingBtn.dataset.lcWired = "1";
        addPairingBtn.addEventListener("click", () => {
          if (!pairingContainer) return;
          const div = document.createElement("div");
          setSafeHTML(div, pairingRowHtml("", "", ""));
          const row = div.firstElementChild;
          if (row) {
            pairingContainer.appendChild(row);
            row.querySelector(".lc-pair-a")?.focus();
          }
        });
      }
      if (pairingContainer && !pairingContainer.dataset.lcWired) {
        pairingContainer.dataset.lcWired = "1";
        pairingContainer.addEventListener("click", (e) => {
          const del = e.target.closest(".lc-pairing-del");
          if (del) del.closest(".lc-pairing-row")?.remove();
        });
      }
      const coreContainer = root.getElementById("lc-core-pills-container");
      if (coreContainer) {
        setSafeHTML(coreContainer, CORE_PRESSURES.map((p) => `
        <span class="lc-pill" data-pressure="${p}" style="display:inline-flex; align-items:center; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:12px; padding:3px 8px; font-size:10px; cursor:pointer; color:#34d399; user-select:none; font-weight:500; transition:background 0.2s;">${p}</span>
      `).join(""));
        coreContainer.querySelectorAll(".lc-pill").forEach((el) => {
          el.addEventListener("click", () => {
            const p = el.getAttribute("data-pressure");
            if (p && pressuresEl) {
              const lines = pressuresEl.value.split("\n").map((l) => l.trim()).filter(Boolean);
              if (!lines.includes(p)) {
                lines.push(p);
                pressuresEl.value = lines.join("\n");
                showToast(`Added pressure: ${p}`);
              }
            }
          });
        });
      }
      const wildContainer = root.getElementById("lc-wild-pills-container");
      if (wildContainer) {
        setSafeHTML(wildContainer, WILDCARDS.map((w) => `
        <span class="lc-pill-wild" data-wildcard="${w}" style="display:inline-flex; align-items:center; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:12px; padding:3px 8px; font-size:10px; cursor:pointer; color:#f87171; user-select:none; font-weight:500; transition:background 0.2s;">${w}</span>
      `).join(""));
        wildContainer.querySelectorAll(".lc-pill-wild").forEach((el) => {
          el.addEventListener("click", () => {
            const w = el.getAttribute("data-wildcard");
            if (w && pressuresEl) {
              const lines = pressuresEl.value.split("\n").map((l) => l.trim()).filter(Boolean);
              if (!lines.includes(w)) {
                lines.push(w);
                pressuresEl.value = lines.join("\n");
                showToast(`Added wildcard: ${w}`);
              }
            }
          });
        });
      }
      const modesContainer = root.getElementById("lc-modes-container");
      if (modesContainer) {
        setSafeHTML(modesContainer, PRESET_MODES.map((m, idx) => `
        <div class="preset-card" data-idx="${idx}" style="background:linear-gradient(135deg, rgba(${m.rgb},0.07), rgba(255,255,255,0.01)); border:1px solid rgba(${m.rgb},0.3); border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:5px; box-sizing:border-box; width:100%;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%;">
            <div style="font-weight:800; color:${m.color}; font-size:12px; text-shadow:0 0 12px rgba(${m.rgb},0.35);">${m.emoji} ${m.name}</div>
            <button class="lc-btn-apply-preset btn-micro" data-idx="${idx}" style="font-weight:600; background:rgba(${m.rgb},0.15); color:${m.color}; border:1px solid rgba(${m.rgb},0.4); white-space:nowrap;">Apply Mode</button>
          </div>
          <div style="font-size:10px; color:var(--text-secondary); line-height:1.3; font-style:italic;">${m.tagline}</div>
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
            ${m.pressures.map((p) => `<span class="lc-preset-pill" data-pressure="${p}" title="Click to add this pressure" style="background:rgba(${m.rgb},0.1); border:1px solid rgba(${m.rgb},0.35); color:${m.color}; border-radius:8px; padding:2px 7px; font-size:9.5px; cursor:pointer; user-select:none; font-weight:500; transition:background 0.2s;">${p}</span>`).join("")}
          </div>
          <div style="border-left:2px solid ${m.color}; font-size:9.5px; color:var(--text-secondary); line-height:1.45; margin-top:4px; font-style:italic; background:rgba(${m.rgb},0.05); border-radius:0 4px 4px 0; padding:4px 6px;">
            <strong style="color:${m.color};">Spark:</strong> ${m.spark}
          </div>
        </div>
      `).join(""));
        modesContainer.querySelectorAll(".lc-btn-apply-preset").forEach((el) => {
          el.addEventListener("click", () => {
            const idx = parseInt(el.getAttribute("data-idx"), 10);
            const mode = PRESET_MODES[idx];
            if (mode && pressuresEl) {
              pressuresEl.value = mode.pressures.join("\n");
              showToast(`Applied preset mode: ${mode.name}`);
            }
          });
        });
        modesContainer.querySelectorAll(".lc-preset-pill").forEach((el) => {
          el.addEventListener("click", () => {
            const p = el.getAttribute("data-pressure");
            if (p && pressuresEl) {
              const lines = pressuresEl.value.split("\n").map((l) => l.trim()).filter(Boolean);
              if (!lines.includes(p)) {
                lines.push(p);
                pressuresEl.value = lines.join("\n");
                showToast(`Added pressure: ${p}`);
              } else {
                showToast(`Already in pool: ${p}`);
              }
            }
          });
        });
      }
      const activeList = root.getElementById("lc-active-list");
      if (activeList) {
        const titlePrefix = state.settings.livingCharactersTitlePrefix || "Life - ";
        const keyPrefix = state.settings.livingCharactersKeyPrefix || "chaos-v2:";
        const lifeCards = (state.cards || []).filter((c) => {
          if (c.deletedAt) return false;
          const typeLower = (c.type || "").toLowerCase();
          const titleLower = (c.title || "").toLowerCase();
          const keysList = (c.keys || "").split(/[,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
          return typeLower === "life" || titleLower.startsWith(titlePrefix.toLowerCase()) || keysList.some((k) => k.startsWith(keyPrefix.toLowerCase()));
        });
        if (lifeCards.length === 0) {
          setSafeHTML(activeList, `<div class="note" style="padding:12px; text-align:center;">No active relationship threads (Life Cards) in play. Seed one below!</div>`);
        } else {
          setSafeHTML(activeList, lifeCards.map((c) => {
            const owner = c.title ? c.title.replace(new RegExp(`^${titlePrefix}`, "i"), "").trim() : "Unknown";
            const parsed = parseLifeCardEntry(c.value);
            const targetName = parsed.target || "none";
            const pressureName = parsed.pressure || "none";
            const occurrence = parsed.occurrence || "none";
            const momentum = parsed.momentum || "low";
            const status = (parsed.status || "active").toLowerCase();
            let statusColor = "#a855f7";
            let statusIcon = "\u26A1";
            if (status === "seedling") {
              statusColor = "#10b981";
              statusIcon = "\u{1F331}";
            } else if (status === "dormant") {
              statusColor = "#6b7280";
              statusIcon = "\u{1F4A4}";
            }
            return `
            <div class="life-card-row" data-cardid="${c.id}" style="background:rgba(255,255,255,0.02); border:1px solid var(--border-color); border-radius:12px; padding:10px; display:flex; flex-direction:column; gap:4px; box-sizing:border-box; width:100%;">
              <div class="life-card-display">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <div style="font-weight:700; color:var(--text-primary); font-size:11.5px; display:flex; align-items:center; gap:6px;">
                    <span style="color:${statusColor}; font-weight:bold; font-size:10px; text-transform:uppercase; border:1px solid ${statusColor}; border-radius:4px; padding:1px 5px; background:color-mix(in srgb, ${statusColor}, transparent 92%); display:inline-flex; align-items:center; gap:3px;">
                      <span>${statusIcon}</span><span>${status}</span>
                    </span>
                    <span>${owner} \u2794 ${targetName}</span>
                  </div>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <button class="lc-status-toggle-btn btn-icon" title="${status === "dormant" ? "Reactivate (back in scene)" : "Mark dormant (paused)"}" style="font-size:12px;">${status === "dormant" ? "\u25B6" : "\u{1F4A4}"}</button>
                    <button class="lc-resolve-btn btn-icon" style="color:#34d399; font-size:12px;" title="Resolve \u2014 archive this pressure, keeping its history">\u2705</button>
                    <button class="lc-card-edit-btn btn-icon" title="Edit relationship details">
                      <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c0.39-0.39 0.39-1.02 0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                      </svg>
                    </button>
                    <button class="lc-card-delete-btn btn-icon" style="color:#f87171;" title="Delete Relationship Card">
                      <svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div style="font-size:11px; margin-top:2px;">
                  <strong style="color:var(--text-primary);">Pressure:</strong> <span style="color:var(--accent-color); font-weight:600;">${pressureName}</span>
                  <span style="margin:0 6px; color:var(--border-color);">|</span>
                  <strong style="color:var(--text-primary);">Urgency:</strong> <span>${momentum}</span>
                </div>
                ${occurrence && occurrence.toLowerCase() !== "none" ? `<div style="font-size:10px; color:var(--text-secondary); line-height:1.4; margin-top:2px; background:rgba(0,0,0,0.1); border-radius:4px; padding:4px 6px; word-break:break-word;">
                  <strong>Latest Occurrence driving pressure:</strong> ${esc(occurrence)}
                </div>` : ""}
              </div>

              <!-- Inline Edit Form -->
              <div class="life-card-edit-form" style="display:none; flex-direction:column; gap:6px; margin-top:4px; border-top:1px solid var(--border-color); padding-top:6px; font-size:10.5px; box-sizing:border-box; width:100%;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; box-sizing:border-box; width:100%;">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Target Name</label>
                    <input type="text" class="edit-lc-target input-compact input-dark" value="${esc(targetName)}" />
                  </div>
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Pressure</label>
                    <input type="text" class="edit-lc-pressure input-compact input-dark" value="${esc(pressureName)}" />
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; box-sizing:border-box; width:100%;">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Urgency</label>
                    <input type="text" class="edit-lc-momentum input-compact input-dark" value="${esc(momentum)}" placeholder="low / medium / high" />
                  </div>
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <label style="font-weight:600;">Status</label>
                    <select class="edit-lc-status input-compact input-dark">
                      <option value="seedling" ${status === "seedling" ? "selected" : ""}>seedling</option>
                      <option value="active" ${status === "active" ? "selected" : ""}>active</option>
                      <option value="dormant" ${status === "dormant" ? "selected" : ""}>dormant</option>
                    </select>
                  </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <label style="font-weight:600;">Latest Occurrence driving pressure</label>
                  <input type="text" class="edit-lc-occurrence input-compact input-dark" value="${esc(occurrence)}" />
                </div>
                <div style="display:flex; gap:6px; justify-content:flex-end; margin-top:2px;">
                  <button class="lc-edit-cancel-btn" style="background:rgba(255,255,255,0.05); border:1px solid var(--border-color); color:var(--text-primary); font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; width:auto; min-height:unset;">Cancel</button>
                  <button class="lc-edit-save-btn" style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#34d399; font-size:10px; padding:3px 8px; border-radius:4px; cursor:pointer; font-weight:600; width:auto; min-height:unset;">Save Changes</button>
                </div>
              </div>
            </div>
          `;
          }).join(""));
          activeList.querySelectorAll(".life-card-row").forEach((row) => {
            const cardId = row.getAttribute("data-cardid");
            const displayDiv = row.querySelector(".life-card-display");
            const formDiv = row.querySelector(".life-card-edit-form");
            row.querySelector(".lc-card-edit-btn")?.addEventListener("click", () => {
              displayDiv.style.display = "none";
              formDiv.style.display = "flex";
            });
            row.querySelector(".lc-status-toggle-btn")?.addEventListener("click", async (e) => {
              e.stopPropagation();
              if (!cbs.setLifeCardStatus) return;
              const card = (state.cards || []).find((c) => c.id === cardId);
              const cur = (parseLifeCardEntry(card?.value).status || "active").toLowerCase();
              const next = cur === "dormant" ? "active" : "dormant";
              const res = await cbs.setLifeCardStatus(cardId, next);
              if (res.error) showToast(res.error, true);
              else showToast(next === "dormant" ? "Relationship marked dormant." : "Relationship reactivated.");
            });
            row.querySelector(".lc-resolve-btn")?.addEventListener("click", async (e) => {
              e.stopPropagation();
              if (!cbs.setLifeCardStatus) return;
              const res = await cbs.setLifeCardStatus(cardId, "resolved");
              if (res.error) showToast(res.error, true);
              else showToast("Pressure resolved and archived (history kept).");
            });
            row.querySelector(".lc-edit-cancel-btn")?.addEventListener("click", () => {
              displayDiv.style.display = "block";
              formDiv.style.display = "none";
            });
            row.querySelector(".lc-edit-save-btn")?.addEventListener("click", async () => {
              const targetVal = formDiv.querySelector(".edit-lc-target").value.trim();
              const pressureVal = formDiv.querySelector(".edit-lc-pressure").value.trim();
              const momentumVal = formDiv.querySelector(".edit-lc-momentum").value.trim();
              const statusVal = formDiv.querySelector(".edit-lc-status").value;
              const occurrenceVal = formDiv.querySelector(".edit-lc-occurrence").value.trim();
              if (!targetVal || !pressureVal) {
                showToast("Target and Pressure are required!", true);
                return;
              }
              const btn = row.querySelector(".lc-edit-save-btn");
              btn.disabled = true;
              btn.textContent = "\u23F3 Saving...";
              try {
                const card = (state.cards || []).find((c) => c.id === cardId);
                const ownerName = card?.title ? card.title.replace(new RegExp(`^${titlePrefix}`, "i"), "").trim() : "Unknown";
                const newValue = buildLifeCardValue({ owner: ownerName, target: targetVal, pressure: pressureVal, occurrence: occurrenceVal || "none", momentum: momentumVal || "low", status: statusVal });
                if (cbs.saveCardValue) {
                  const res = await cbs.saveCardValue(cardId, newValue);
                  if (res.error) {
                    showToast(res.error, true);
                  } else {
                    showToast("Relationship updated successfully!");
                  }
                }
              } catch (err) {
                showToast(err?.message || String(err), true);
              } finally {
                btn.disabled = false;
                btn.textContent = "Save Changes";
              }
            });
            const delBtn = row.querySelector(".lc-card-delete-btn");
            if (delBtn) {
              let armTimeout = null;
              delBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (delBtn.classList.contains("armed")) {
                  clearTimeout(armTimeout);
                  delBtn.classList.remove("armed");
                  delBtn.innerHTML = `<svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
                  delBtn.setAttribute("title", "Delete Relationship Card");
                  delBtn.setAttribute("style", "color:#f87171;");
                  try {
                    if (cbs.deleteStoryCard) {
                      const res = await cbs.deleteStoryCard(cardId);
                      if (res.error) {
                        showToast(res.error, true);
                      } else {
                        showToast("Relationship card deleted.");
                      }
                    }
                  } catch (err) {
                    showToast(err?.message || String(err), true);
                  }
                } else {
                  delBtn.classList.add("armed");
                  delBtn.innerHTML = `<span style="font-size:9px;font-weight:bold;background:#ef4444;color:#fff;padding:1px 4px;border-radius:3px;display:inline-flex;align-items:center;line-height:1;">Confirm?</span>`;
                  delBtn.setAttribute("title", "Click again to confirm delete");
                  delBtn.setAttribute("style", "color:#ffffff;");
                  armTimeout = setTimeout(() => {
                    delBtn.classList.remove("armed");
                    delBtn.innerHTML = `<svg style="width:14px;height:14px;fill:currentColor;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;
                    delBtn.setAttribute("title", "Delete Relationship Card");
                    delBtn.setAttribute("style", "color:#f87171;");
                  }, 3e3);
                }
              });
            }
          });
        }
      }
    }
    async function compressSettings(settings) {
      const cleanSettings = { ...settings };
      delete cleanSettings.apiKeys;
      delete cleanSettings.keyStatus;
      if (cleanSettings.cardCommands) {
        const activeCommands = {};
        for (const [key, val] of Object.entries(cleanSettings.cardCommands)) {
          if (val && val !== DEFAULT_CARD_COMMANDS[key]) {
            activeCommands[key] = val;
          }
        }
        if (Object.keys(activeCommands).length > 0) {
          cleanSettings.cardCommands = activeCommands;
        } else {
          delete cleanSettings.cardCommands;
        }
      }
      if (cleanSettings.customPromptSection1 === DEFAULT_PROMPT_SECTION_1) delete cleanSettings.customPromptSection1;
      if (cleanSettings.customPromptSection2 === DEFAULT_PROMPT_SECTION_2) delete cleanSettings.customPromptSection2;
      if (cleanSettings.customPromptSection3 === DEFAULT_PROMPT_SECTION_3) delete cleanSettings.customPromptSection3;
      if (cleanSettings.customPromptSection4 === DEFAULT_PROMPT_SECTION_4) delete cleanSettings.customPromptSection4;
      if (cleanSettings.theme === "emerald") delete cleanSettings.theme;
      if (cleanSettings.formattingMode === DEFAULT_FORMATTING_MODE) delete cleanSettings.formattingMode;
      if (cleanSettings.analyzeWindow === 20) delete cleanSettings.analyzeWindow;
      if (cleanSettings.memoraidThoughtLookback === 1) delete cleanSettings.memoraidThoughtLookback;
      if (cleanSettings.completionTemperature === 0.7) delete cleanSettings.completionTemperature;
      if (cleanSettings.memoraidPresenceLookback === 5) delete cleanSettings.memoraidPresenceLookback;
      if (cleanSettings.thoughtCardLimit === 2e3) delete cleanSettings.thoughtCardLimit;
      if (cleanSettings.interceptTimeout === 4) delete cleanSettings.interceptTimeout;
      if (cleanSettings.locationMode === "optionA") delete cleanSettings.locationMode;
      if (cleanSettings.enableProperNounDetection !== false) delete cleanSettings.enableProperNounDetection;
      if (!cleanSettings.enableAutomaticUpdates) delete cleanSettings.enableAutomaticUpdates;
      if (cleanSettings.showDebug === false) delete cleanSettings.showDebug;
      if (cleanSettings.useMemories === false) delete cleanSettings.useMemories;
      if (cleanSettings.autoRegenerateMemoryBankEntry === false) delete cleanSettings.autoRegenerateMemoryBankEntry;
      const jsonStr = JSON.stringify(cleanSettings);
      try {
        if (typeof CompressionStream !== "undefined") {
          const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream("gzip"));
          const response = new Response(stream);
          const buffer = await response.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buffer);
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return "gz:" + btoa(binary);
        }
      } catch (err) {
        console.warn("[AID panel] Gzip compression failed, falling back to raw base64:", err);
      }
      return "raw:" + btoa(unescape(encodeURIComponent(jsonStr)));
    }
    const QR_PAYLOAD_CHAR_THRESHOLD = 1500;
    function showQrModal(payload) {
      root.getElementById("qr-modal")?.remove();
      const modal = document.createElement("div");
      modal.id = "qr-modal";
      const activeTheme = lastState?.settings?.theme || "emerald";
      modal.className = `theme-${activeTheme}`;
      modal.style.cssText = "display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);box-sizing:border-box;";
      const container = document.createElement("div");
      container.style.cssText = "background:var(--bg-panel-solid);border:1px solid var(--border-color);border-radius:12px;padding:20px;width:280px;display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:0 20px 40px rgba(0,0,0,0.5);text-align:center;color:var(--text-primary);box-sizing:border-box;";
      const title = document.createElement("div");
      title.style.cssText = "font-weight:700;color:var(--theme-text-color);font-size:14px;letter-spacing:0.02em;";
      title.textContent = "Sync Settings to Mobile";
      const note = document.createElement("div");
      note.className = "note";
      note.style.cssText = "margin:0;font-size:11px;line-height:1.4;color:var(--text-secondary);";
      const qrUrl = window.location.origin + "/?importSettings=" + encodeURIComponent(payload);
      const tooLarge = qrUrl.length > QR_PAYLOAD_CHAR_THRESHOLD;
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn";
      copyBtn.style.cssText = "background:rgba(255,255,255,0.08);color:var(--text-primary);font-weight:600;font-size:11px;padding:6px 16px;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;width:100%;text-align:center;";
      copyBtn.textContent = "\u{1F4CB} Copy Sync String";
      const copyFallback = document.createElement("textarea");
      copyFallback.readOnly = true;
      copyFallback.value = qrUrl;
      copyFallback.style.cssText = "display:none;width:100%;height:64px;font-size:9px;font-family:SFMono-Regular,Consolas,monospace;background:rgba(0,0,0,0.3);color:var(--text-primary);border:1px solid var(--border-color);border-radius:6px;padding:6px;box-sizing:border-box;resize:none;";
      copyBtn.addEventListener("click", () => {
        const flashCopied = () => {
          const oldText = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = oldText;
          }, 1500);
        };
        const showFallback = () => {
          copyFallback.style.display = "block";
          copyFallback.focus();
          copyFallback.select();
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(qrUrl).then(flashCopied).catch(showFallback);
        } else {
          showFallback();
        }
      });
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "btn";
      closeBtn.style.cssText = "background:var(--accent-color);color:#fff;font-weight:600;font-size:11px;padding:6px 16px;border-radius:6px;border:none;cursor:pointer;margin-top:4px;width:100%;text-align:center;";
      closeBtn.textContent = "Close";
      container.appendChild(title);
      if (tooLarge) {
        note.textContent = "Settings too large for a reliable QR \u2014 copy the sync string instead. Paste the copied link into your mobile browser's address bar (with the extension installed) to import.";
        container.appendChild(note);
        container.appendChild(copyBtn);
        container.appendChild(copyFallback);
      } else {
        note.textContent = "Scan this code with your mobile device's camera to import settings (excluding API keys).";
        container.appendChild(note);
        const canvasContainer = document.createElement("div");
        canvasContainer.id = "qr-canvas-container";
        canvasContainer.style.cssText = "background:#fff;padding:8px;border-radius:8px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:180px;height:180px;";
        container.appendChild(canvasContainer);
        try {
          qr_creator_es6_min_default.render({
            text: qrUrl,
            radius: 0.2,
            ecLevel: "M",
            fill: "#111111",
            background: "#ffffff",
            size: 164,
            quiet: 4
          }, canvasContainer);
        } catch (err) {
          console.error("[AID panel] QrCreator failed to render:", err);
          canvasContainer.style.background = "#fee2e2";
          canvasContainer.style.color = "#991b1b";
          canvasContainer.style.flexDirection = "column";
          canvasContainer.style.fontSize = "10px";
          canvasContainer.style.padding = "12px";
          canvasContainer.textContent = "QR Code generation failed. The settings payload may be too large. Try resetting some templates to default.";
        }
        const copyCaption = document.createElement("div");
        copyCaption.style.cssText = "font-size:10px;color:var(--text-secondary);";
        copyCaption.textContent = "Can't scan? Copy the sync string instead \u2014 paste the link into your mobile browser's address bar.";
        container.appendChild(copyCaption);
        container.appendChild(copyBtn);
        container.appendChild(copyFallback);
      }
      container.appendChild(closeBtn);
      modal.appendChild(container);
      root.appendChild(modal);
      const closeModal = () => modal.remove();
      closeBtn.addEventListener("click", closeModal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    }
    const panelHandle = {
      setStatus: (t) => {
        st.textContent = t;
      },
      showToast: (text, isError) => {
        if (!isContextValid()) return;
        showToast(text, isError);
      },
      onExport: (cb) => {
        const safe = safeCallback(cb);
        $("ex-story").addEventListener("click", () => safe("story"));
        $("ex-cards").addEventListener("click", () => safe("cards"));
        $("ex-pe").addEventListener("click", () => safe("pe"));
        $("ex-aidmemories").addEventListener("click", () => safe("aidmemories"));
        $("ex-propernouns")?.addEventListener("click", () => safe("propernouns"));
        $("ex-all").addEventListener("click", () => safe("all"));
      },
      // Delegated by class so every entry point works, including dynamically re-rendered ones
      // (Debug tab, Adventures Manager header, and the empty-DB self-heal banner).
      onBackupAll: (cb) => {
        const safe = safeCallback(cb);
        root.addEventListener("click", (e) => {
          if (e.target?.closest?.(".db-backup-trigger")) safe();
        });
      },
      onRestoreAll: (cb) => {
        const safe = safeCallback(cb);
        root.addEventListener("click", (e) => {
          if (e.target?.closest?.(".db-restore-trigger")) safe();
        });
      },
      showSelfHealBanner: () => {
        if (!isContextValid()) return;
        const results2 = root.getElementById("results");
        if (!results2 || root.getElementById("self-heal-banner")) return;
        const banner = document.createElement("div");
        banner.id = "self-heal-banner";
        banner.setAttribute("style", "margin:8px;padding:10px 12px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);border-radius:8px;color:var(--text-primary);font-size:11.5px;line-height:1.5;");
        setSafeHTML(banner, `<strong>No local data found.</strong> If you just swapped the signed extension for a test build, Firefox cleared its IndexedDB.<br/><button class="db-restore-trigger" style="margin-top:8px;padding:5px 10px;background:rgba(245,158,11,0.22);color:#fbbf24;border:1px solid rgba(245,158,11,0.4);border-radius:6px;cursor:pointer;font-weight:bold;">\u2B06 Restore from Backup\u2026</button>`);
        results2.parentElement?.insertBefore(banner, results2);
      },
      onBackfill: (cb) => $("bf").addEventListener("click", safeCallback(cb)),
      onRefineMemoryBlock: (cb) => {
        refineMemoryBlockCb = safeCallback(cb);
        $("refine-mem")?.addEventListener("click", () => {
          const btn = $("refine-mem");
          if (btn) {
            btn.disabled = true;
            btn.textContent = "Regenerating memory...";
          }
          if (refineMemoryBlockCb && lastState?.aidMemories && lastState.aidMemories.length > 0) {
            refineMemoryBlockCb(lastState.aidMemories.length - 1);
          }
        });
      },
      showAnalyzeResult: showAnalyzeResultFn,
      onSaveSettings: (cb) => {
        const safe = safeCallback(cb);
        $("save").addEventListener("click", () => {
          const n = parseInt(winEl.value, 10);
          const showDbg = root.getElementById("show-dbg").checked;
          const useMems = root.getElementById("use-memories").checked;
          const autoRegenMems = root.getElementById("auto-regen-memories").checked;
          const cardCommands = {};
          for (const k of TYPE_KEYS) {
            const el = root.getElementById("cc-" + k);
            const v = el?.value.trim();
            if (v) cardCommands[k] = v;
          }
          const fmtMode = root.getElementById("fmt-mode")?.value || DEFAULT_FORMATTING_MODE;
          const mtl = parseInt(memoraidThoughtWinEl.value, 10);
          const mpl = parseInt(memoraidPresenceWinEl.value, 10);
          const to = parseInt(interceptTimeoutEl.value, 10);
          const memoraidThoughtLookback = Number.isFinite(mtl) && mtl >= 1 ? mtl : 1;
          const memoraidPresenceLookback = Number.isFinite(mpl) && mpl > 0 ? mpl : 5;
          const interceptTimeout = Number.isFinite(to) && to > 0 ? to : 4;
          const locMode = root.getElementById("location-mode").value;
          const properNounDetect = root.getElementById("enable-proper-noun-detection").checked;
          const enableAutomaticUpdates = root.getElementById("enable-automatic-updates").checked;
          const enableMemoraid = root.getElementById("enable-memoraid")?.checked ?? true;
          const enableCrystallized = root.getElementById("enable-crystallized")?.checked ?? false;
          const cVal = parseInt(root.getElementById("crystallized-interval")?.value || "", 10);
          const crystallizedInterval = Number.isFinite(cVal) && cVal > 0 ? cVal : 20;
          const mcVal = parseInt(root.getElementById("crystallized-max-chars")?.value || "", 10);
          const crystallizedEntryMaxChars = Number.isFinite(mcVal) && mcVal > 0 ? mcVal : 900;
          const ncVal = parseInt(root.getElementById("crystallized-node-cap")?.value || "", 10);
          const crystallizedNodeCap = Number.isFinite(ncVal) && ncVal > 0 ? ncVal : 12;
          const kcVal = parseInt(root.getElementById("crystallized-knows-cap")?.value || "", 10);
          const crystallizedKnowsCap = Number.isFinite(kcVal) && kcVal > 0 ? kcVal : 2;
          const rcVal = parseInt(root.getElementById("crystallized-recalls-cap")?.value || "", 10);
          const crystallizedRecallsCap = Number.isFinite(rcVal) && rcVal >= 0 ? rcVal : 2;
          const vcVal = parseInt(root.getElementById("crystallized-vivid-cap")?.value || "", 10);
          const crystallizedVividCap = Number.isFinite(vcVal) && vcVal > 0 ? vcVal : 4;
          const ocVal = parseInt(root.getElementById("crystallized-outlook-cap")?.value || "", 10);
          const crystallizedOutlookCap = Number.isFinite(ocVal) && ocVal > 0 ? ocVal : 2;
          const pcVal = parseInt(root.getElementById("crystallized-preferences-cap")?.value || "", 10);
          const crystallizedPreferencesCap = Number.isFinite(pcVal) && pcVal > 0 ? pcVal : 4;
          const nmVal = parseInt(root.getElementById("crystallized-npc-memory-cap")?.value || "", 10);
          const crystallizedNpcMemoryCap = Number.isFinite(nmVal) && nmVal > 0 ? nmVal : 400;
          const crystallizedKnowsEnabled = root.getElementById("crystallized-knows-enabled")?.checked ?? true;
          const crystallizedNodesEnabled = root.getElementById("crystallized-nodes-enabled")?.checked ?? true;
          const crystallizedOutlookEnabled = root.getElementById("crystallized-outlook-enabled")?.checked ?? true;
          const crystallizedPreferencesEnabled = root.getElementById("crystallized-preferences-enabled")?.checked ?? true;
          const crystallizedNpcMemoryEnabled = root.getElementById("crystallized-npc-memory-enabled")?.checked ?? true;
          const tcl = parseInt(thoughtCardLimitEl.value, 10);
          const thoughtCardLimit = Number.isFinite(tcl) && tcl >= 100 ? tcl : 2e3;
          const ctVal = parseFloat(completionTempEl?.value ?? "");
          const completionTemperature = Number.isFinite(ctVal) ? Math.max(0, Math.min(1, ctVal)) : 0.7;
          const settings = {
            provider: provEl.value,
            model: modelEl.value.trim() || void 0,
            analyzeWindow: Number.isFinite(n) && n > 0 ? n : 20,
            showDebug: showDbg,
            theme: themeEl.value,
            customPromptSection1: root.getElementById("prompt-s1").value,
            customPromptSection2: root.getElementById("prompt-s2").value,
            customPromptSection3: root.getElementById("prompt-s3").value,
            customPromptSection4: root.getElementById("prompt-s4").value,
            cardCommands,
            useMemories: useMems,
            formattingMode: fmtMode,
            memoraidThoughtLookback,
            memoraidPresenceLookback,
            thoughtCardLimit,
            completionTemperature,
            autoRegenerateMemoryBankEntry: autoRegenMems,
            interceptTimeout,
            locationMode: locMode,
            enableProperNounDetection: properNounDetect,
            enableAutomaticUpdates,
            enableMemorAID: enableMemoraid,
            enableLivingCharacters: enableLcEl.checked,
            livingCharactersTitlePrefix: lcTitlePrefixEl.value,
            livingCharactersKeyPrefix: lcKeyPrefixEl.value,
            groupThoughtsInRoster: groupThoughtsEl.checked,
            enableCrystallized,
            crystallizedInterval,
            crystallizedEntryMaxChars,
            crystallizedNodeCap,
            crystallizedKnowsCap,
            crystallizedRecallsCap,
            crystallizedVividCap,
            crystallizedOutlookCap,
            crystallizedPreferencesCap,
            crystallizedNpcMemoryCap,
            crystallizedKnowsEnabled,
            crystallizedNodesEnabled,
            crystallizedOutlookEnabled,
            crystallizedPreferencesEnabled,
            crystallizedNpcMemoryEnabled
          };
          const apiKey = keyEl.value.trim();
          if (apiKey) {
            settings.apiKeys = { [provEl.value]: apiKey };
          }
          safe(settings, protEl.value.trim());
          showTrackerView();
        });
        const lcSaveBtn = root.getElementById("lc-btn-save-config");
        if (lcSaveBtn) {
          lcSaveBtn.addEventListener("click", () => {
            if (!lastState || !lastState.settings) return;
            const rosterEl = root.getElementById("lc-config-roster");
            const pressuresEl = root.getElementById("lc-config-pressures");
            const protagonistEl = root.getElementById("lc-config-protagonist");
            const involvementEl = root.getElementById("lc-config-involvement");
            const intervalEl = root.getElementById("lc-config-interval");
            const maxEl = root.getElementById("lc-config-max");
            const relevanceEl = root.getElementById("lc-config-relevance");
            const dormancyEl = root.getElementById("lc-config-dormancy");
            const reseedEl = root.getElementById("lc-config-reseed-cooldown");
            const staleEl = root.getElementById("lc-config-stale");
            const maxLifetimeEl = root.getElementById("lc-config-max-lifetime");
            const nInterval = intervalEl ? parseInt(intervalEl.value, 10) : 15;
            const nMax = maxEl ? parseInt(maxEl.value, 10) : 2;
            const nDormancy = dormancyEl ? parseInt(dormancyEl.value, 10) : 7;
            const nReseed = reseedEl ? parseInt(reseedEl.value, 10) : 15;
            const nStale = staleEl ? parseInt(staleEl.value, 10) : 14;
            const nMaxLifetime = maxLifetimeEl ? parseInt(maxLifetimeEl.value, 10) : 4;
            const pairingContainerSave = root.getElementById("lc-pairing-pools");
            const pressurePairs = pairingContainerSave ? Array.from(pairingContainerSave.querySelectorAll(".lc-pairing-row")).map((row) => ({
              a: row.querySelector(".lc-pair-a")?.value.trim() || "",
              b: row.querySelector(".lc-pair-b")?.value.trim() || "",
              pressures: (row.querySelector(".lc-pair-pressures")?.value || "").split(",").map((s) => s.trim()).filter(Boolean)
            })).filter((p) => p.a && p.b && p.pressures.length) : [];
            const config = {
              roster: rosterEl ? rosterEl.value.trim() : "",
              pressures: pressuresEl ? pressuresEl.value.trim() : "",
              pressurePairs,
              protagonistInvolvement: involvementEl ? involvementEl.value : "normal",
              interval: Number.isFinite(nInterval) ? nInterval : 15,
              maxActive: Number.isFinite(nMax) ? nMax : 2,
              sceneRelevance: relevanceEl ? relevanceEl.value : "strict",
              dormancyTurns: Number.isFinite(nDormancy) ? nDormancy : 7,
              reseedCooldown: Number.isFinite(nReseed) ? nReseed : 15,
              staleTurns: Number.isFinite(nStale) ? nStale : 14,
              maxActiveTurns: Number.isFinite(nMaxLifetime) && nMaxLifetime >= 0 ? nMaxLifetime : 4,
              continueInjectionMode: root.getElementById("lc-config-continue-mode")?.value || "defer"
            };
            const protName = protagonistEl ? protagonistEl.value.trim() : "";
            if (cbs.setLivingConfig) {
              cbs.setLivingConfig(config, protName).then((res) => {
                if (res?.error) showToast(res.error, true);
                else showToast("Simulation config saved!");
              }).catch((err) => showToast(err?.message || String(err), true));
            }
          });
        }
      },
      onGrantPermissions: (cb) => {
        $("grant-permissions")?.addEventListener("click", safeCallback(cb));
      },
      on: registerPanelEvent,
      onRefresh: (cb) => {
        refreshCb = safeCallback(cb);
      },
      updateActionCount: (count2, lastAnalysisAction) => {
        if (lastState) {
          lastState.actionCount = count2;
          lastState.actionsCount = count2;
          if (lastAnalysisAction !== void 0) lastState.lastAnalysisAction = lastAnalysisAction;
        }
        const statTurn = root.getElementById("stat-turn");
        if (statTurn) statTurn.textContent = String(count2);
        const lastAn = lastAnalysisAction ?? lastState?.lastAnalysisAction ?? 0;
        const statSince = root.getElementById("stat-since");
        if (statSince) statSince.textContent = lastAn > 0 ? String(count2 - lastAn) : "-";
      },
      updateMemories: (memories) => {
        if (!lastState) return;
        lastState.aidMemories = memories ?? [];
        renderMemoriesSection(lastState);
      },
      setModels: (models, current) => {
        const opts = [...models];
        if (current && !opts.includes(current)) opts.unshift(current);
        setSafeHTML(modelEl, opts.length ? opts.map((m) => `<option value="${esc(m)}"${m === current ? " selected" : ""}>${esc(m)}</option>`).join("") : `<option value="">(enter API key, then reopen settings)</option>`);
        if (current) modelEl.value = current;
      },
      showDebug: (d) => {
        lastDebug = d;
        const dbgContainer = root.getElementById("debug-container");
        if (dbgContainer) {
          if (d) {
            setSafeHTML(dbgContainer, `<details open style="margin-top:8px;border-top:1px solid #333;padding-top:4px;"><summary style="cursor:pointer;color:#8a8;">\u{1F50D} Analyze debug</summary><div class="note">characters: ${esc((d.characters || []).join(", "))}</div><div class="note">narrative chars: ${esc(String(d.narrativeChars))}</div><div class="note">narrative tail:</div><div>${esc(d.narrativeTail || "")}</div><div class="note">raw response (truncated):</div><div>${esc(d.rawSnippet || "")}</div></details>`);
          } else {
            dbgContainer.textContent = "";
          }
        }
      },
      render: (state) => {
        const prevState = lastState;
        lastState = state;
        if (state.activeSetupQuestion) {
          setupHelperContainer.style.display = "block";
          const q = state.activeSetupQuestion;
          const prevDrawer = setupHelperContainer.querySelector(".setup-helper-drawer");
          const wasOpen = prevDrawer ? prevDrawer.open : true;
          const searchInput = setupHelperContainer.querySelector("#setup-favorites-search");
          const searchVal = searchInput ? searchInput.value : "";
          const activeEl = root.activeElement;
          const wasSearchFocused = activeEl && activeEl.id === "setup-favorites-search";
          const listEl = setupHelperContainer.querySelector("#setup-favorites-list");
          setSafeHTML(setupHelperContainer, `
          <details class="group-header setup-helper-drawer" ${wasOpen ? "open" : ""} style="--accent-color:#c084fc; --accent-glow:rgba(168,85,247,0.15); border-left-color:#c084fc !important; margin-bottom:8px;">
            <summary style="color:#c084fc !important; font-weight:700;">
              <span>\u{1F52E} Scenario Setup: ${q.type === "text" ? "Text Input" : "Multiple Choice"}</span>
            </summary>
            <div style="padding:10px 12px; display:flex; flex-direction:column; gap:8px; box-sizing:border-box; width:100%; background:rgba(168,85,247,0.02); border-top:1px solid rgba(168,85,247,0.15);">
              <div style="font-size:11.5px; line-height:1.45; color:var(--text-primary); font-weight:500; word-break:break-word; max-height:80px; overflow-y:auto; border-left:2px solid rgba(168,85,247,0.3); padding-left:8px; margin-bottom:4px;">
                ${esc(q.question)}
              </div>
              
              ${q.type === "text" ? `
                <div style="position:relative; margin-top:2px;">
                  <input type="text" id="setup-favorites-search" placeholder="Search Favorites..." value="${esc(searchVal)}" style="width:100%; margin:0; padding:5px 8px; font-size:11px; background:rgba(0,0,0,0.3); color:var(--text-primary); border-radius:6px; border:1px solid rgba(255,255,255,0.08); box-sizing:border-box; font-family:inherit;" />
                </div>
                <div id="setup-favorites-list" style="margin-top:4px; padding-right:4px;">
                  ${renderSetupFavorites(state.globalAssets || [], searchVal, q.question, listEl || void 0)}
                </div>
              ` : `
                <div style="font-size:10px; color:var(--text-secondary); font-style:italic;">
                  Select one of the numbered options on the page to proceed.
                </div>
              `}
            </div>
          </details>
        `);
          if (wasSearchFocused) {
            const newSearch = root.getElementById("setup-favorites-search");
            if (newSearch) {
              newSearch.focus();
              newSearch.setSelectionRange(searchVal.length, searchVal.length);
            }
          }
        } else {
          setupHelperContainer.style.display = "none";
          setupHelperContainer.innerHTML = "";
        }
        const setupActionCount = state.actionCount ?? state.actionsCount ?? 0;
        const inSetupPhase = isSetupPhase({
          isManagerOnly: !!state.isManagerOnly,
          hasActiveSetupQuestion: !!state.activeSetupQuestion,
          actionCount: setupActionCount
        });
        const mainTabNav = viewTracker.querySelector(".main-tab-nav");
        const locationBanners = root.getElementById("location-banners-container");
        const trackerScrollable = root.getElementById("view-tracker-scrollable");
        const mainTabTracker = root.getElementById("main-tab-tracker");
        if (mainTabNav) mainTabNav.style.display = inSetupPhase ? "none" : "";
        if (locationBanners) locationBanners.style.display = inSetupPhase ? "none" : "";
        if (trackerScrollable) trackerScrollable.style.display = inSetupPhase ? "none" : "";
        if (mainTabTracker) mainTabTracker.style.overflowY = inSetupPhase ? "auto" : "";
        if (!state.isManagerOnly) {
          const targetPane = visibleMainTabPane(inSetupPhase, activeTabId);
          root.querySelectorAll(".main-tab-pane").forEach((p) => {
            p.style.display = p.id === targetPane ? "flex" : "none";
          });
        }
        const tabManagerPane = root.getElementById("tab-manager");
        if (tabManagerPane && (tabManagerPane.style.display === "block" || tabManagerPane.style.display === "flex" || state.isManagerOnly)) {
          renderAdventuresManager(state);
        }
        const isManagerOnly = !!state.isManagerOnly;
        if (isManagerOnly) {
          viewTracker.style.display = "none";
          viewSettings.style.display = "flex";
          viewAnalyze.style.display = "none";
          const tabNav = viewSettings.querySelector(".tab-nav");
          if (tabNav) tabNav.style.display = "none";
          const footer = root.getElementById("settings-footer");
          if (footer) footer.style.display = "none";
          viewSettings.querySelectorAll(".tab-pane").forEach((pane) => {
            if (pane.id !== "tab-manager") {
              pane.style.display = "none";
            }
          });
          if (tabManagerPane) tabManagerPane.style.display = "flex";
        } else {
          const tabNav = viewSettings.querySelector(".tab-nav");
          if (tabNav) tabNav.style.display = "flex";
          const footer = root.getElementById("settings-footer");
          if (footer) footer.style.display = "flex";
          const activeBtn = viewSettings.querySelector(".tab-btn.active");
          const currentActiveTab = activeBtn?.getAttribute("data-tab");
          if (currentActiveTab) {
            switchTab(currentActiveTab);
          }
          if (prevState && prevState.isManagerOnly && !isManagerOnly) {
            showTrackerView();
          }
        }
        const isShortIdChanged = !prevState || state.shortId !== prevState.shortId;
        if (state.scenario !== prevState?.scenario || state.protagonist !== prevState?.protagonist) {
          knownMemories.clear();
        }
        const titleTail = [state.scenario, state.protagonist].filter(Boolean).join(" - ");
        st.textContent = titleTail ? `AID Story Helper: ${titleTail}` : "AID Story Helper";
        if (isShortIdChanged) {
          protEl.value = state.protagonist || "";
        } else if (document.activeElement !== protEl) {
          protEl.value = state.protagonist || "";
        }
        const shouldForceUpdate = isShortIdChanged || !prevState;
        if (state.settings?.theme && (shouldForceUpdate || root.activeElement !== themeEl) && themeEl.value !== state.settings.theme) {
          themeEl.value = state.settings.theme;
          updateThemeClass();
        }
        if (state.settings?.provider && (shouldForceUpdate || root.activeElement !== provEl) && provEl.value !== state.settings.provider) {
          provEl.value = state.settings.provider;
          updateProviderLabels();
        }
        const prov = provEl.value;
        if (state.settings?.keyStatus?.[prov] && !keyEl.value) {
          keyEl.placeholder = "\u2022\u2022\u2022\u2022 (key saved)";
        } else if (!keyEl.value) {
          updateProviderLabels();
        }
        if (state.settings?.analyzeWindow && (!winEl.value || shouldForceUpdate || root.activeElement !== winEl)) {
          winEl.value = String(state.settings.analyzeWindow);
        }
        if (state.settings && (!memoraidThoughtWinEl.value || shouldForceUpdate || root.activeElement !== memoraidThoughtWinEl)) {
          memoraidThoughtWinEl.value = String(Math.max(1, state.settings.memoraidThoughtLookback ?? 1));
        }
        if (completionTempEl && state.settings && (shouldForceUpdate || root.activeElement !== completionTempEl)) {
          const t = Math.max(0, Math.min(1, state.settings.completionTemperature ?? 0.7));
          completionTempEl.value = String(t);
          if (completionTempValEl) completionTempValEl.textContent = t.toFixed(2);
        }
        if (state.settings && (!memoraidPresenceWinEl.value || shouldForceUpdate || root.activeElement !== memoraidPresenceWinEl)) {
          memoraidPresenceWinEl.value = String(state.settings.memoraidPresenceLookback ?? 5);
        }
        if (state.settings && (!interceptTimeoutEl.value || shouldForceUpdate || root.activeElement !== interceptTimeoutEl)) {
          interceptTimeoutEl.value = String(state.settings.interceptTimeout ?? 4);
        }
        const locModeEl = root.getElementById("location-mode");
        if (locModeEl && state.settings && (shouldForceUpdate || root.activeElement !== locModeEl)) {
          locModeEl.value = state.settings.locationMode || "optionA";
        }
        const properNounDetectEl = root.getElementById("enable-proper-noun-detection");
        if (properNounDetectEl && state.settings && (shouldForceUpdate || root.activeElement !== properNounDetectEl)) {
          properNounDetectEl.checked = state.settings.enableProperNounDetection !== false;
        }
        const autoUpdatesEl = root.getElementById("enable-automatic-updates");
        if (autoUpdatesEl && state.settings && (shouldForceUpdate || root.activeElement !== autoUpdatesEl)) {
          autoUpdatesEl.checked = !!state.settings.enableAutomaticUpdates;
        }
        const showDbgEl = root.getElementById("show-dbg");
        if (showDbgEl && state.settings && (shouldForceUpdate || root.activeElement !== showDbgEl)) {
          showDbgEl.checked = !!state.settings.showDebug;
        }
        const useMemsEl = root.getElementById("use-memories");
        if (useMemsEl && state.settings && (shouldForceUpdate || root.activeElement !== useMemsEl)) {
          useMemsEl.checked = !!state.settings.useMemories;
        }
        const autoRegenMemsEl = root.getElementById("auto-regen-memories");
        if (autoRegenMemsEl && state.settings && (shouldForceUpdate || root.activeElement !== autoRegenMemsEl)) {
          autoRegenMemsEl.checked = !!state.settings.autoRegenerateMemoryBankEntry;
        }
        if (enableLcEl && state.settings && (shouldForceUpdate || root.activeElement !== enableLcEl)) {
          enableLcEl.checked = state.settings.enableLivingCharacters !== false;
        }
        if (lcTitlePrefixEl && state.settings && (shouldForceUpdate || root.activeElement !== lcTitlePrefixEl)) {
          lcTitlePrefixEl.value = state.settings.livingCharactersTitlePrefix ?? "Life - ";
        }
        if (lcKeyPrefixEl && state.settings && (shouldForceUpdate || root.activeElement !== lcKeyPrefixEl)) {
          lcKeyPrefixEl.value = state.settings.livingCharactersKeyPrefix ?? "chaos-v2:";
        }
        if (groupThoughtsEl && state.settings && (shouldForceUpdate || root.activeElement !== groupThoughtsEl)) {
          groupThoughtsEl.checked = !!state.settings.groupThoughtsInRoster;
        }
        if (charCardLimitEl && (!charCardLimitEl.value || shouldForceUpdate || root.activeElement !== charCardLimitEl)) {
          charCardLimitEl.value = "600";
        }
        if (memoraidWinEl && (!memoraidWinEl.value || shouldForceUpdate || root.activeElement !== memoraidWinEl)) {
          memoraidWinEl.value = "8";
        }
        if (thoughtCardLimitEl && state.settings && (shouldForceUpdate || root.activeElement !== thoughtCardLimitEl) && thoughtCardLimitEl.value !== String(state.settings.thoughtCardLimit ?? 2e3)) {
          thoughtCardLimitEl.value = String(state.settings.thoughtCardLimit ?? 2e3);
        }
        const enableMemoraidEl = root.getElementById("enable-memoraid");
        if (enableMemoraidEl) enableMemoraidEl.checked = state.settings?.enableMemorAID !== false;
        const enableCrystallizedEl = root.getElementById("enable-crystallized");
        if (enableCrystallizedEl) enableCrystallizedEl.checked = !!state.settings?.enableCrystallized;
        if (crystallizedIntervalEl && (shouldForceUpdate || root.activeElement !== crystallizedIntervalEl)) {
          crystallizedIntervalEl.value = String(state.settings?.crystallizedInterval ?? 20);
        }
        if (crystallizedEntryMaxCharsEl && (shouldForceUpdate || root.activeElement !== crystallizedEntryMaxCharsEl)) {
          crystallizedEntryMaxCharsEl.value = String(state.settings?.crystallizedEntryMaxChars ?? 900);
        }
        if (crystallizedNodeCapEl && (shouldForceUpdate || root.activeElement !== crystallizedNodeCapEl)) {
          crystallizedNodeCapEl.value = String(state.settings?.crystallizedNodeCap ?? 12);
        }
        if (crystallizedKnowsCapEl && (shouldForceUpdate || root.activeElement !== crystallizedKnowsCapEl)) {
          crystallizedKnowsCapEl.value = String(state.settings?.crystallizedKnowsCap ?? 2);
        }
        if (crystallizedRecallsCapEl && (shouldForceUpdate || root.activeElement !== crystallizedRecallsCapEl)) {
          crystallizedRecallsCapEl.value = String(state.settings?.crystallizedRecallsCap ?? 2);
        }
        if (crystallizedVividCapEl && (shouldForceUpdate || root.activeElement !== crystallizedVividCapEl)) {
          crystallizedVividCapEl.value = String(state.settings?.crystallizedVividCap ?? 4);
        }
        if (crystallizedOutlookCapEl && (shouldForceUpdate || root.activeElement !== crystallizedOutlookCapEl)) {
          crystallizedOutlookCapEl.value = String(state.settings?.crystallizedOutlookCap ?? 2);
        }
        if (crystallizedPreferencesCapEl && (shouldForceUpdate || root.activeElement !== crystallizedPreferencesCapEl)) {
          crystallizedPreferencesCapEl.value = String(state.settings?.crystallizedPreferencesCap ?? 4);
        }
        if (crystallizedNpcMemoryCapEl && (shouldForceUpdate || root.activeElement !== crystallizedNpcMemoryCapEl)) {
          crystallizedNpcMemoryCapEl.value = String(state.settings?.crystallizedNpcMemoryCap ?? 400);
        }
        const crystKnowsEl = root.getElementById("crystallized-knows-enabled");
        if (crystKnowsEl) crystKnowsEl.checked = state.settings?.crystallizedKnowsEnabled !== false;
        const crystNodesEl = root.getElementById("crystallized-nodes-enabled");
        if (crystNodesEl) crystNodesEl.checked = state.settings?.crystallizedNodesEnabled !== false;
        const crystOutlookEnEl = root.getElementById("crystallized-outlook-enabled");
        if (crystOutlookEnEl) crystOutlookEnEl.checked = state.settings?.crystallizedOutlookEnabled !== false;
        const crystPrefsEnEl = root.getElementById("crystallized-preferences-enabled");
        if (crystPrefsEnEl) crystPrefsEnEl.checked = state.settings?.crystallizedPreferencesEnabled !== false;
        const crystNpcMemEnEl = root.getElementById("crystallized-npc-memory-enabled");
        if (crystNpcMemEnEl) crystNpcMemEnEl.checked = state.settings?.crystallizedNpcMemoryEnabled !== false;
        if (state.settings) {
          const s1 = root.getElementById("prompt-s1");
          const s2 = root.getElementById("prompt-s2");
          const s3 = root.getElementById("prompt-s3");
          const s4 = root.getElementById("prompt-s4");
          if (s1 && (shouldForceUpdate || root.activeElement !== s1)) s1.value = state.settings.customPromptSection1 || DEFAULT_PROMPT_SECTION_1;
          if (s2 && (shouldForceUpdate || root.activeElement !== s2)) s2.value = state.settings.customPromptSection2 || DEFAULT_PROMPT_SECTION_2;
          if (s3 && (shouldForceUpdate || root.activeElement !== s3)) s3.value = state.settings.customPromptSection3 || DEFAULT_PROMPT_SECTION_3;
          if (s4 && (shouldForceUpdate || root.activeElement !== s4)) s4.value = state.settings.customPromptSection4 || DEFAULT_PROMPT_SECTION_4;
        }
        const opsEl = root.getElementById("learned-ops-list");
        if (opsEl && state.ops) {
          opsEl.textContent = state.ops.length > 0 ? state.ops.map((o) => `${o.kind === "write" ? "\u270D" : "\u{1F4D6}"} ${o.operationName}:
${o.query.trim()}`).join("\n\n---\n\n") : "None";
        }
        const statTurn = root.getElementById("stat-turn");
        const statLastAuto = root.getElementById("stat-last-auto");
        const curAction = state.actionCount ?? state.actionsCount ?? 0;
        if (statTurn) statTurn.textContent = String(curAction);
        if (statLastAuto) {
          statLastAuto.textContent = state.lastAutoUpdatedCard || "-";
        }
        const charGroups = /* @__PURE__ */ new Map();
        for (const v of state.versions) {
          const key = v.characterName + (v.source === "card" ? "::" + (v.cardType || "character") : "");
          const arr = charGroups.get(key) ?? [];
          arr.push(v);
          charGroups.set(key, arr);
        }
        for (const missingKey of activeCardsMissingFromRoster(state.cards ?? [], charGroups.keys())) {
          if (!charGroups.has(missingKey)) charGroups.set(missingKey, []);
        }
        for (const list of charGroups.values()) {
          list.sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
        }
        let html = "";
        const allNames = Array.from(charGroups.keys());
        const sortedNames = [];
        const placedNames = /* @__PURE__ */ new Set();
        const addName = (n) => {
          const lower = n.trim().toLowerCase();
          for (const an of allNames) {
            const namePart = (an.split("::")[0] || "").trim().toLowerCase();
            if (namePart === lower) {
              const anLower = an.trim().toLowerCase();
              if (!placedNames.has(anLower)) {
                sortedNames.push(an);
                placedNames.add(anLower);
              }
            }
          }
        };
        if (state.protagonist) {
          addName(state.protagonist);
        }
        if (state.memory) {
          const blocks = parsePlotEssentials(state.memory);
          for (const b of blocks) {
            addName(b.name);
          }
        }
        const remaining = allNames.filter((n) => !placedNames.has(n.trim().toLowerCase())).sort((a, b) => a.localeCompare(b));
        for (const n of remaining) {
          const firstPart = n.split("::")[0];
          if (firstPart) {
            addName(firstPart);
          }
        }
        const sortedChars = sortedNames.map((name) => [name, charGroups.get(name)]);
        const cardTypeByName = /* @__PURE__ */ new Map();
        const cardIdByName = /* @__PURE__ */ new Map();
        const deletedNames = computeDeletedNames(state.cards ?? []);
        for (const c of state.cards ?? []) {
          const keysList = (c.keys || "").split(/[,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
          for (const k of keysList) {
            cardTypeByName.set(k, c.type || "character");
            cardIdByName.set(k + "::" + (c.type || "character").toLowerCase(), c.id);
            cardIdByName.set(k, c.id);
          }
          const fullKey = (c.title || c.keys || "").trim().toLowerCase();
          if (fullKey) {
            cardTypeByName.set(fullKey, c.type || "character");
            cardIdByName.set(fullKey + "::" + (c.type || "character").toLowerCase(), c.id);
            cardIdByName.set(fullKey, c.id);
          }
        }
        for (const c of state.cards ?? []) {
          if (c.title) {
            const titleLower = c.title.trim().toLowerCase();
            cardTypeByName.set(titleLower, c.type || "character");
            cardIdByName.set(titleLower + "::" + (c.type || "character").toLowerCase(), c.id);
            cardIdByName.set(titleLower, c.id);
          }
        }
        const plotNames = /* @__PURE__ */ new Set();
        if (state.protagonist) plotNames.add(state.protagonist.trim().toLowerCase());
        for (const b of parsePlotEssentials(state.memory || "")) plotNames.add(b.name.trim().toLowerCase());
        const TYPE_LABELS = { character: "Characters", class: "Classes", race: "Races", location: "Locations", faction: "Factions" };
        const typeLabelFor = (key) => {
          const parts = key.split("::");
          const name = parts[0] || "";
          const type = parts[1];
          const titlePrefix = (state.settings?.livingCharactersTitlePrefix || "Life - ").toLowerCase();
          const keyPrefix = (state.settings?.livingCharactersKeyPrefix || "chaos-v2:").toLowerCase();
          const explicit = explicitTypeLabel(name, type, titlePrefix);
          if (explicit) return explicit;
          const isLifeCard = () => {
            if (type && type.toLowerCase() === "life") return true;
            const nameLower = name.trim().toLowerCase();
            if (nameLower.startsWith(titlePrefix)) return true;
            const card = (state.cards ?? []).find((c) => !c.deletedAt && (c.title?.toLowerCase() === nameLower || c.keys?.split(/[,;]+/).map((k) => k.trim().toLowerCase()).includes(nameLower)));
            if (card) {
              if ((card.type || "").toLowerCase() === "life") return true;
              if ((card.title || "").toLowerCase().startsWith(titlePrefix)) return true;
              const keysList = (card.keys || "").split(/[,;]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
              if (keysList.some((k) => k.startsWith(keyPrefix))) return true;
            }
            return false;
          };
          if (isLifeCard()) {
            return "Life";
          }
          const isThoughtCard = () => {
            if (!state.settings?.groupThoughtsInRoster) return false;
            if (type && (type.toLowerCase() === "memory" || type.toLowerCase() === "thoughts")) return true;
            const nameLower = name.trim().toLowerCase();
            if (nameLower.endsWith(" (memory)") || nameLower.endsWith(" - thoughts")) return true;
            const card = (state.cards ?? []).find((c) => !c.deletedAt && (c.title?.toLowerCase() === nameLower || c.keys?.split(/[,;]+/).map((k) => k.trim().toLowerCase()).includes(nameLower)));
            if (card) {
              const cardTypeLower = (card.type || "").toLowerCase();
              if (cardTypeLower === "memory" || cardTypeLower === "thoughts") return true;
              const cardTitleLower = (card.title || "").toLowerCase();
              if (cardTitleLower.endsWith(" (memory)") || cardTitleLower.endsWith(" - thoughts")) return true;
            }
            return false;
          };
          const isCrystallizedCard = () => {
            const nameLower = name.trim().toLowerCase();
            if (nameLower.endsWith(" - crystallized")) return true;
            if (type && type.toLowerCase() === "crystallized") return true;
            const exactTitleCard = (state.cards ?? []).find((c) => !c.deletedAt && (c.title || "").trim().toLowerCase() === nameLower);
            if (!exactTitleCard) return false;
            const cardTypeLower = (exactTitleCard.type || "").toLowerCase();
            if (cardTypeLower === "crystallized") return true;
            return (exactTitleCard.title || "").trim().toLowerCase().endsWith(" - crystallized");
          };
          if (isCrystallizedCard()) {
            return "Crystallized";
          }
          if (isThoughtCard()) {
            return "Thoughts";
          }
          if (type) {
            const lowerType = type.toLowerCase();
            if (TYPE_LABELS[lowerType]) return TYPE_LABELS[lowerType];
            return type.charAt(0).toUpperCase() + type.slice(1);
          }
          const lower = name.trim().toLowerCase();
          const t = cardTypeByName.get(lower);
          if (t) {
            const lowerT = t.toLowerCase();
            if (TYPE_LABELS[lowerT]) return TYPE_LABELS[lowerT];
            return t.charAt(0).toUpperCase() + t.slice(1);
          }
          if (plotNames.has(lower)) return "Plot Essentials";
          return "Other";
        };
        const activeNames = /* @__PURE__ */ new Set();
        for (const c of state.cards ?? []) {
          if (c.deletedAt) continue;
          const type = (c.type || "character").toLowerCase();
          const add = (n) => {
            const k = n.trim().toLowerCase();
            if (k) {
              activeNames.add(k);
              activeNames.add(`${k}::${type}`);
            }
          };
          if (c.title) add(c.title);
          for (const k of (c.keys || "").split(/[,;]+/)) add(k);
        }
        const isArchived = (key) => {
          const parts = key.split("::");
          const name = parts[0] || "";
          const type = parts[1];
          const bareName = name.trim().toLowerCase();
          const lookupKey = type ? `${bareName}::${type.toLowerCase()}` : bareName;
          if (activeNames.has(lookupKey) || activeNames.has(bareName)) return false;
          return deletedNames.has(lookupKey) || deletedNames.has(bareName);
        };
        const activeGrouped = /* @__PURE__ */ new Map();
        const archivedGrouped = /* @__PURE__ */ new Map();
        activeGrouped.set("Plot Essentials", []);
        const memoraidEnabled = state.settings?.enableMemorAID !== false;
        const memoraidNames = state.memoraidCharacters ?? [];
        for (const entry of sortedChars) {
          if ((entry[0].split("::")[0] || "").trim().toLowerCase() === "configure memoraid") continue;
          const lbl = typeLabelFor(entry[0]);
          const target = isArchived(entry[0]) ? archivedGrouped : activeGrouped;
          const arr = target.get(lbl) ?? [];
          arr.push(entry);
          target.set(lbl, arr);
        }
        const LABEL_ORDER = ["Plot Essentials", "Characters", "Thoughts", "Crystallized", "Life", "Classes", "Races", "Locations", "Factions"];
        const rank = (l) => l === "Other" ? 1e3 : LABEL_ORDER.indexOf(l) === -1 ? 500 : LABEL_ORDER.indexOf(l);
        const orderLabels = (keys) => [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
        const openGroups = /* @__PURE__ */ new Set();
        const hasExistingGroups = results.querySelectorAll("details[data-group]").length > 0;
        if (!hasExistingGroups) {
          openGroups.add(memoraidEnabled && memoraidNames.length ? "memoraid-config" : "active-Plot Essentials");
        } else {
          results.querySelectorAll("details[data-group]").forEach((d) => {
            if (d.open) openGroups.add(d.getAttribute("data-group") || "");
          });
        }
        const renderChars = (groupChars, isArchivedSection = false) => {
          let out = "";
          for (const [key, list] of groupChars) {
            const parts = key.split("::");
            const displayName = parts[0] || "";
            const type = parts[1];
            const charPending = list.filter((v) => v.status === "pending");
            const charApplied = list.filter((v) => v.status === "applied");
            const hasPending = charPending.length > 0;
            const isCharOpen = hasPending ? " open" : "";
            const stateStyles = hasPending ? "border-color:rgba(239, 68, 68, 0.25);background:rgba(239, 68, 68, 0.05);" : isArchivedSection ? "opacity:0.7;" : "";
            const titleColor = hasPending ? "color:#fca5a5;" : isArchivedSection ? "color:var(--text-secondary);" : "";
            let actionText = "";
            const isProtagonist = state.protagonist && displayName.trim().toLowerCase() === state.protagonist.trim().toLowerCase();
            if (!isProtagonist && charApplied.length > 0) {
              const latest = charApplied[charApplied.length - 1];
              if (latest && latest.actionCount != null) {
                actionText = ` <span style="color:var(--text-secondary);font-size:10.5px;font-weight:normal;margin-left:4px;">(Last Updated: Action #${latest.actionCount})</span>`;
              }
            }
            out += `<details class="char-card" data-card-title="${esc(displayName)}"${isCharOpen}${stateStyles ? ` style="${stateStyles}"` : ""}><summary${titleColor ? ` style="${titleColor}"` : ""}><span>${esc(displayName)}${actionText}` + (hasPending ? ` <span style="background:rgba(239, 68, 68, 0.2);color:#fca5a5;font-size:9px;padding:2px 6px;border-radius:4px;margin-left:6px;display:inline-block;vertical-align:middle;font-weight:bold;">Proposal</span>` : "") + (isArchivedSection ? ` <span style="background:rgba(255, 255, 255, 0.06);color:var(--text-secondary);font-size:9px;padding:2px 6px;border-radius:4px;margin-left:6px;display:inline-block;vertical-align:middle;">Archived</span>` : "") + `</span></summary><div class="char-card-body">`;
            const lookupKey = type ? `${displayName.trim().toLowerCase()}::${type.toLowerCase()}` : displayName.trim().toLowerCase();
            const genCardId = cardIdByName.get(lookupKey) ?? cardIdByName.get(displayName.trim().toLowerCase());
            if (genCardId && !isArchivedSection) {
              const isCrystallized = displayName.toLowerCase().endsWith(" - crystallized") || type && type.toLowerCase() === "crystallized";
              if (isCrystallized) {
                const charName = displayName.replace(/\s*-\s*crystallized$/i, "");
                out += `<button class="action-btn distill-now-btn" data-card-id="${esc(genCardId)}" data-char-name="${esc(charName)}" style="margin-bottom:8px;margin-right:6px;background:rgba(59,130,246,0.12);color:#60a5fa;border-color:rgba(59,130,246,0.3);">Distill now</button><button class="action-btn consolidate-crystallized-btn" data-card-id="${esc(genCardId)}" style="margin-bottom:8px;margin-right:6px;background:rgba(168,85,247,0.12);color:#c084fc;border-color:rgba(168,85,247,0.3);">Consolidate</button><button class="action-btn consolidate-outlook-btn" data-char-name="${esc(charName)}" title="Fold this character's settled beliefs (Outlook) into their character card as a proposed revision, then clear them from Crystallized" style="margin-bottom:8px;background:rgba(245,158,11,0.12);color:#fbbf24;border-color:rgba(245,158,11,0.3);">Consolidate Outlook</button>`;
              } else {
                const isCharacterType = (type || "").toLowerCase() === "character";
                const genLabel = isCharacterType ? "\u26A1 Generate Core Character" : "\u26A1 Generate (AID)";
                out += `<button class="action-btn" data-gen-card="${esc(genCardId)}" style="margin-bottom:8px;background:rgba(245,158,11,0.12);color:#fbbf24;border-color:rgba(245,158,11,0.3);">${genLabel}</button>`;
                if (isCharacterType) {
                  out += `<button class="action-btn" data-gen-compact="${esc(genCardId)}" style="margin-bottom:8px;margin-left:6px;background:rgba(34,211,238,0.12);color:#22d3ee;border-color:rgba(34,211,238,0.3);" title="Generate a shorter side-character card \u2014 details without high resolution">\u2728 Generate Side Character</button>`;
                  out += `<button class="action-btn" data-reroll-card="${esc(genCardId)}" style="margin-bottom:8px;margin-left:6px;background:rgba(168,85,247,0.12);color:#c084fc;border-color:rgba(168,85,247,0.3);" title="Re-sample this character's body and rewrite their physical description (keeps personality)">\u{1F3B2} Re-roll Body</button>`;
                }
              }
              out += `<button class="action-btn card-delete-btn" data-card-id="${esc(genCardId)}" style="margin-bottom:8px;margin-left:6px;background:rgba(239,68,68,0.12);color:#f87171;border-color:rgba(239,68,68,0.3);">Delete</button>`;
            }
            if (hasPending) {
              out += `<div class="pending-proposal-box"><div class="pending-title">Pending Proposal</div>` + charPending.map((v) => {
                const actionText2 = v.actionCount != null ? ` (Action ${v.actionCount})` : "";
                return `<div><div class="pending-summary">${esc(v.changeSummary)}${actionText2}</div><details class="char-section"><summary>view proposed entry</summary><div class="char-section-body"><div class="code-card" style="border-color:rgba(239, 68, 68, 0.25);border-left-color:rgba(239, 68, 68, 0.5);margin:0;"><div class="code-card-header" style="color:#fca5a5;border-color:rgba(239, 68, 68, 0.15);">Proposed: ${esc(v.changeSummary)}${actionText2}</div><pre style="color:#fdd;">${esc(v.entry)}</pre></div></div></details><div style="margin-top:8px;"><button class="action-btn" data-vid="${esc(v.id)}" data-act="applied" style="background:rgba(16, 185, 129, 0.15);color:#10b981;border-color:rgba(16, 185, 129, 0.3);margin-right:6px;">Accept</button><button class="action-btn" data-vid="${esc(v.id)}" data-act="rejected" style="background:rgba(239, 68, 68, 0.15);color:#f87171;border-color:rgba(239, 68, 68, 0.3);">Reject</button></div></div>`;
              }).join("") + `</div>`;
            }
            if (charApplied.length > 0) {
              const latest = charApplied[charApplied.length - 1];
              const actionText2 = latest.actionCount != null ? ` (Last Updated Action: #${latest.actionCount})` : "";
              out += `<details class="char-section"><summary>Current Entry${actionText2}</summary><div class="char-section-body"><div class="code-card" style="margin:0;"><div class="code-card-header">Latest: ${esc(latest.changeSummary)}</div><pre>${esc(latest.entry)}</pre></div></div></details>`;
              if (genCardId && !isArchivedSection) {
                out += `<div style="margin-top:10px;margin-bottom:10px;"><button class="open-card-editor action-btn" data-card-id="${esc(genCardId)}" style="background:rgba(255,255,255,0.04);color:var(--text-primary);border-color:var(--border-color);">\u270F\uFE0F Edit Card (entry &amp; triggers)</button></div>`;
              }
              out += `<div class="history-header">History & Rewrites</div><div class="history-list">` + [...charApplied].reverse().map((v) => {
                const time = new Date(v.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const actionText3 = v.actionCount != null ? ` (Action #${v.actionCount})` : "";
                const isBaseline = v.changeSummary.startsWith("Baseline");
                const summaryHeader = isBaseline ? `${esc(v.changeSummary)}${actionText3}` : `Action #${v.actionCount ?? "##"}`;
                return `<details class="history-item"><summary>${summaryHeader}</summary><div class="history-detail-body"><div class="history-meta"><span>${esc(v.changeSummary)}</span><span class="note">(${time})</span></div><details class="view-entry-detail"><summary>view entry</summary><div class="code-card" style="margin:4px 0 0;"><pre>${esc(v.entry)}</pre></div></details><div style="margin-top:4px;">` + (v.pushedAt ? `<span class="note" style="color:var(--accent-color);font-weight:600;">\u2713 Pushed to AID</span>` : `<button class="action-btn" data-vid="${esc(v.id)}" data-act="push">\u2B06 Apply to AID</button>`) + `</div></div></details>`;
              }).join("") + `</div>`;
            } else if (charPending.length === 0) {
              out += `<div class="note">No entries recorded.</div>`;
            }
            out += `</div></details>`;
          }
          return out;
        };
        const renderSection = (grouped, sectionPrefix, isArchivedSection = false) => {
          let sectionHtml = "";
          for (const lbl of orderLabels(grouped.keys())) {
            const groupKey = `${sectionPrefix}-${lbl}`;
            const chars = grouped.get(lbl);
            const wasOpen = openGroups.has(groupKey);
            const charCount = chars.length;
            const pendingCount = chars.reduce((sum, [, vs]) => sum + vs.filter((v) => v.status === "pending").length, 0);
            const openAttr = wasOpen ? " open" : "";
            const pendingBadge = pendingCount > 0 ? ` <span class="badge-new-proposals">+${pendingCount}</span>` : "";
            const countBadge = ` <span style="color:var(--text-secondary);font-size:10px;font-weight:normal;">(${charCount})</span>`;
            if (lbl === "Characters" && !isArchivedSection) {
              console.log("[AID panel] Characters group names:", chars.map((c) => c[0]));
            }
            let prefixHtml = "";
            if (lbl === "Plot Essentials" && !isArchivedSection) {
              const lookbackVal = state.settings?.analyzeWindow ?? 20;
              const curAction2 = state.actionCount ?? state.actionsCount ?? 0;
              const lastAnAction = state.lastAnalysisAction ?? 0;
              const sinceLastUpdate = lastAnAction > 0 ? String(curAction2 - lastAnAction) : "-";
              prefixHtml = `<button id="an" class="btn-primary" style="width:100%;margin-bottom:6px;">\u27F3 Update Plot Essentials</button><div style="font-size:9.5px;color:var(--text-secondary);margin-bottom:10px;text-align:center;font-family:SFMono-Regular,Consolas,monospace;display:flex;justify-content:space-around;gap:8px;box-sizing:border-box;width:100%;"><div>Since Last Update Check: <span id="stat-since" style="color:var(--accent-color);font-weight:bold;">${sinceLastUpdate}</span></div><div>Action Lookback Window: <span id="stat-lookback" style="color:var(--accent-color);font-weight:bold;">${lookbackVal}</span></div></div>`;
            }
            const hasPending = pendingCount > 0;
            const proposalsClass = hasPending ? " has-proposals" : "";
            const isCrystal = lbl === "Crystallized";
            const groupStyle = isCrystal ? ` style="--accent-color:#22d3ee; --accent-glow:rgba(34,211,238,0.18); border-left-color:#22d3ee !important;"` : "";
            const lblHtml = isCrystal ? `\u{1F48E} ${esc(lbl)}` : esc(lbl);
            sectionHtml += `<details class="group-header${proposalsClass}" data-group="${esc(groupKey)}"${openAttr}${groupStyle}><summary><span>${lblHtml}${countBadge}${pendingBadge}</span></summary><div style="padding:4px 8px 8px;">` + prefixHtml + renderChars(chars, isArchivedSection) + `</div></details>`;
          }
          return sectionHtml;
        };
        if (memoraidEnabled) {
          const mOpen = openGroups.has("memoraid-config") ? " open" : "";
          html += `<details class="group-header" data-group="memoraid-config"${mOpen} style="--accent-color:#fbbf24; --accent-glow:rgba(245,158,11,0.15); border-left-color:#fbbf24 !important;"><summary><span>\u{1F9E0} MemorAID</span></summary><div style="padding:6px 8px 8px;"><div class="note" style="margin:0 0 6px;">Characters listed here get NPC thought tracking (MemorAID memory cards). One name per line.</div><label style="font-weight:600;font-size:11px;color:var(--text-primary);">Important Characters</label><textarea class="memoraid-chars-input input-dark" placeholder="e.g.
Anna
Bob" style="width:100%;min-height:90px;margin:4px 0 8px;box-sizing:border-box;resize:vertical;">${esc(memoraidNames.join("\n"))}</textarea><button class="memoraid-save-btn btn-primary" style="width:100%;">\u{1F4BE} Save Characters</button></div></details>`;
        }
        html += renderSection(activeGrouped, "active");
        if (archivedGrouped.size > 0) {
          const totalArchived = [...archivedGrouped.values()].reduce((s, arr) => s + arr.length, 0);
          const archiveGroupKey = "archive-section";
          const wasArchiveOpen = openGroups.has(archiveGroupKey);
          html += `<details class="archive-header" data-group="${archiveGroupKey}"${wasArchiveOpen ? " open" : ""}><summary><span>\u{1F4E6} Archived <span style="font-weight:normal;font-size:10px;">(${totalArchived} card${totalArchived === 1 ? "" : "s"})</span></span></summary><div style="padding:4px 8px 8px;"><div class="note" style="margin-bottom:6px;">Cards deleted from AID but preserved here with their history.</div>` + renderSection(archivedGrouped, "archived", true) + `</div></details>`;
        }
        setSafeHTML(results, html);
        const bannersContainer = root.getElementById("location-banners-container");
        const locationCards = (state.cards ?? []).filter(
          (c) => !c.deletedAt && (c.type || "").toLowerCase() === "location"
        );
        let bannersHtml = "";
        if (locationCards.length > 0) {
          const activeId = state.activeLocationId || "";
          const prevAlm = root.getElementById("alm-banner");
          const almOpen = prevAlm ? prevAlm.open : window.innerWidth > 600;
          const activeName = activeId ? locationCards.find((c) => c.id === activeId)?.title || "?" : "";
          bannersHtml += `
          <details id="alm-banner" class="location-manager-banner"${almOpen ? " open" : ""} style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:8px;padding:8px 10px;margin-bottom:8px;box-sizing:border-box;">
            <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px;list-style:none;">
              <span style="font-weight:700;color:var(--theme-text-color);font-size:11px;text-transform:uppercase;letter-spacing:0.03em;white-space:nowrap;">Active Location</span>
              <span style="font-size:11px;color:${activeId ? "var(--accent-color)" : "var(--text-secondary)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;text-align:right;">${activeId ? esc(activeName) : "none"}</span>
            </summary>
            <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
              <select id="active-location-select" style="margin:0;padding:4px 8px;font-size:11.5px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:6px;border:1px solid rgba(255,255,255,0.08);flex:1;min-width:0;">
                <option value="" ${!activeId ? "selected" : ""}>-- Select Active Location --</option>
                ${locationCards.map((c) => `
                  <option value="${esc(c.id)}"${c.id === activeId ? " selected" : ""}>${esc(c.title || c.keys)}</option>
                `).join("")}
              </select>
              ${activeId ? `<button id="clear-active-location" class="btn-micro btn-micro--red" style="flex-shrink:0;">Clear</button>` : ""}
            </div>
          </details>
        `;
        }
        if (bannersContainer) {
          setSafeHTML(bannersContainer, bannersHtml);
          const selectEl = root.getElementById("active-location-select");
          selectEl?.addEventListener("change", () => {
            const cardId = selectEl.value || null;
            if (cbs.setActiveLocation) {
              cbs.setActiveLocation(cardId);
            }
          });
          const clearBtn = root.getElementById("clear-active-location");
          clearBtn?.addEventListener("click", () => {
            if (cbs.setActiveLocation) {
              cbs.setActiveLocation(null);
            }
          });
        }
        renderHome(root, state, {
          respondToProperNounSuggestion: cbs.respondToProperNounSuggestion,
          linkProperNounToCard: cbs.linkProperNounToCard,
          proposalDecision: cbs.proposalDecision
        }, { esc, setSafeHTML, buildCardPickerOptions, showToast });
        const pnLogsList = root.getElementById("pn-logs-list");
        if (pnLogsList && state.properNounLogs) {
          if (state.properNounLogs.length === 0) {
            setSafeHTML(pnLogsList, `<div class="note" style="text-align:center;padding:10px 0;">No proper noun logs recorded.</div>`);
          } else {
            const linkPickerOptions = buildCardPickerOptions(state.cards);
            let pnLogsHtml = "";
            for (const log of state.properNounLogs) {
              const selectedType = log.type || (log.isLocation ? "location" : log.isCharacter ? "character" : "");
              const linkedTag = log.linkedCardTitle ? ` <span style="color:#93c5fd;font-size:9.5px;white-space:nowrap;" title="Linked to ${esc(log.linkedCardTitle)}">\u2192 ${esc(log.linkedCardTitle)}</span>` : "";
              pnLogsHtml += `
              <div class="pn-log-item" data-pn="${esc(log.properNoun)}" style="display:flex;flex-direction:column;gap:4px;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:11px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span style="display:flex;align-items:center;gap:4px;overflow:hidden;min-width:0;">
                    <span style="font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;" title="${esc(log.properNoun)}">${esc(log.properNoun)}</span>${linkedTag}
                  </span>
                  <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                    <select class="pn-log-select" style="margin:0;padding:2px 4px;font-size:10px;width:auto;max-width:120px;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">${buildTypePickerOptions(state.cards, selectedType)}</select>
                    <button class="pn-log-link-btn" style="margin:0;padding:2px 4px;background:none;border:none;cursor:pointer;color:var(--text-secondary);" title="Link to existing card">\u{1F517}</button>
                    <button class="pn-log-del-btn" style="margin:0;padding:2px 4px;background:none;border:none;cursor:pointer;color:var(--text-secondary);" title="Delete Log">\u{1F5D1}</button>
                  </div>
                </div>
                <div class="pn-log-link-row" style="display:none;gap:4px;align-items:center;">
                  <select class="pn-log-link-select" style="margin:0;padding:2px 4px;font-size:10.5px;flex-grow:1;min-width:0;background:rgba(0,0,0,0.3);color:var(--text-primary);border-radius:4px;border:1px solid rgba(255,255,255,0.08);">${linkPickerOptions}</select>
                </div>
              </div>
            `;
            }
            setSafeHTML(pnLogsList, pnLogsHtml);
            pnLogsList.querySelectorAll(".pn-log-select").forEach((sel) => {
              sel.addEventListener("change", () => {
                const item = sel.closest(".pn-log-item");
                const pn = item?.getAttribute("data-pn") || "";
                const val = sel.value;
                if (cbs.updateProperNounLog) {
                  cbs.updateProperNounLog(pn, val);
                }
              });
            });
            pnLogsList.querySelectorAll(".pn-log-link-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const item = btn.closest(".pn-log-item");
                const row = item?.querySelector(".pn-log-link-row");
                if (row) row.style.display = row.style.display === "none" ? "flex" : "none";
              });
            });
            pnLogsList.querySelectorAll(".pn-log-link-select").forEach((sel) => {
              sel.addEventListener("change", () => {
                const item = sel.closest(".pn-log-item");
                const pn = item?.getAttribute("data-pn") || "";
                const cardId = sel.value;
                if (cardId && cbs.linkProperNounToCard) {
                  cbs.linkProperNounToCard(pn, cardId);
                }
              });
            });
            pnLogsList.querySelectorAll(".pn-log-del-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const item = btn.closest(".pn-log-item");
                const pn = item?.getAttribute("data-pn") || "";
                if (cbs.deleteProperNounLog) {
                  cbs.deleteProperNounLog(pn);
                }
              });
            });
          }
        }
        const clearPnLogsBtn = root.getElementById("clear-pn-logs");
        if (clearPnLogsBtn) {
          const newBtn = clearPnLogsBtn.cloneNode(true);
          clearPnLogsBtn.parentNode?.replaceChild(newBtn, clearPnLogsBtn);
          newBtn.addEventListener("click", () => {
            if (cbs.clearProperNounLogs) {
              cbs.clearProperNounLogs();
            }
          });
        }
        const dbgContainer = root.getElementById("debug-container");
        if (dbgContainer) {
          dbgContainer.style.display = state.settings?.showDebug ? "block" : "none";
          if (state.settings?.showDebug && lastDebug) {
            setSafeHTML(dbgContainer, `<details open style="margin-top:8px;border-top:1px solid #333;padding-top:4px;"><summary style="cursor:pointer;color:#8a8;">\u{1F50D} Analyze debug</summary><div class="note">characters: ${esc((lastDebug.characters || []).join(", "))}</div><div class="note">narrative chars: ${esc(String(lastDebug.narrativeChars))}</div><div class="note">narrative tail:</div><div>${esc(lastDebug.narrativeTail || "")}</div><div class="note">raw response (truncated):</div><div>${esc(lastDebug.rawSnippet || "")}</div></details>`);
          } else if (!state.settings?.showDebug) {
            dbgContainer.textContent = "";
          }
        }
        renderMemoriesSection(state);
        renderNpcMemoryBank(state);
        renderLivingCharactersSection(state);
        const pendingTotal = pendingDecisionsCount(state.locationSuggestions, state.versions);
        const homeBadge = root.getElementById("home-pending-badge");
        if (homeBadge) {
          if (activeTabId === "main-tab-home" || pendingTotal === 0) {
            homeBadge.style.display = "none";
            homeBadge.className = "";
          } else {
            homeBadge.textContent = `+${pendingTotal}`;
            homeBadge.style.display = "inline-block";
            homeBadge.className = "badge-new-proposals";
          }
        }
        updateMinState();
      },
      clearCrystallizedSchemaCache: (cardId) => {
        crystallizedSchemaCache.delete(cardId);
        crystallizedPreferencesCache.delete(cardId);
      },
      refreshNpcMemory: (charName, generated, remaining, done, block) => {
        if (block && !insertNpcMemBlock(charName, block)) {
          npcMemoryCache.delete(charName.toLowerCase());
          if (lastState) renderNpcMemoryBank(lastState);
        }
        const setBtn = (text) => {
          root.querySelectorAll(".backfill-npc-memories-btn").forEach((b) => {
            if (b.getAttribute("data-char-name") === charName) {
              b.disabled = !!text;
              b.textContent = text ?? "Backfill memories";
            }
          });
        };
        if (npcBackfillWatchdog) {
          clearTimeout(npcBackfillWatchdog);
          npcBackfillWatchdog = null;
        }
        if (done) {
          setBtn(null);
          if (typeof generated === "number") {
            panelHandle.showToast(remaining && remaining > 0 ? `Backfilled ${generated} \u2014 ${remaining} left, click again to continue.` : `Backfilled ${generated} memories \u2014 ${charName} up to date.`);
          }
          return;
        }
        if (typeof generated === "number") {
          setBtn(remaining && remaining > 0 ? `\u23F3 ${generated} done, ${remaining} left\u2026` : `\u23F3 ${generated}\u2026`);
        }
        npcBackfillWatchdog = setTimeout(() => {
          npcBackfillWatchdog = null;
          setBtn(null);
          panelHandle.showToast(`Backfill for ${charName} stopped responding \u2014 refresh to see what landed.`, true);
        }, 6e4);
      }
    };
    return panelHandle;
  }

  // src/content/content.ts
  function isContextValid2() {
    try {
      if (typeof browser === "undefined" || !browser.runtime) {
        return false;
      }
      browser.runtime.getManifest();
      return true;
    } catch (e) {
      return false;
    }
  }
  var activeShortId = null;
  var lastKnownActionCount = null;
  var autoBackfillsInFlight = /* @__PURE__ */ new Set();
  function detectSetupQuestion(actionCount) {
    if (actionCount != null && actionCount > 0) return null;
    let typeHereInput = document.querySelector('input[placeholder*="Type here" i], textarea[placeholder*="Type here" i]');
    if (!typeHereInput) {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea'));
      typeHereInput = inputs.find((el) => {
        if (el.getRootNode() !== document) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const id = (el.id || "").toLowerCase();
        const cls = (el.className || "").toLowerCase();
        const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
        if (id.includes("search") || cls.includes("search") || placeholder.includes("search")) return false;
        return true;
      }) || null;
    }
    if (typeHereInput) {
      let questionText = "";
      const parentContainer = typeHereInput.closest("div");
      if (parentContainer) {
        const texts = Array.from(parentContainer.querySelectorAll("p, span, h1, h2, h3, h4, div")).map((el) => el.textContent?.trim() || "").filter((t) => t && t.length > 5 && !t.toLowerCase().includes("type here") && !t.includes("NEXT") && !t.includes("FINISH"));
        if (texts.length > 0) {
          questionText = texts[0] || "";
        }
      }
      return {
        type: "text",
        question: questionText || "Enter setup placeholder",
        inputEl: typeHereInput
      };
    }
    const candidates = Array.from(document.querySelectorAll('div, button, a, [role="button"], li, span'));
    const choiceButtons = candidates.filter((btn) => {
      const text = btn.textContent?.trim() || "";
      if (text.length > 80) return false;
      const isChoiceFormat = /^\d+\s*[\s\.\:\)\-]?\s*[A-Za-z]/.test(text) || /^\(\d+\)/.test(text) || /^\d+$/.test(text);
      if (!isChoiceFormat) return false;
      const children = Array.from(btn.querySelectorAll("div, button, a, li, span"));
      const hasChildChoice = children.some((child) => {
        const childText = child.textContent?.trim() || "";
        return childText.length <= 80 && (/^\d+\s*[\s\.\:\)\-]?\s*[A-Za-z]/.test(childText) || /^\(\d+\)/.test(childText) || /^\d+$/.test(childText));
      });
      if (hasChildChoice) return false;
      return true;
    });
    if (choiceButtons.length > 0) {
      let questionText = "";
      const firstBtn = choiceButtons[0];
      if (firstBtn) {
        const parent = firstBtn.parentElement;
        if (parent) {
          const texts = Array.from(parent.querySelectorAll("h1, h2, h3, h4, p, span, div")).map((el) => el.textContent?.trim() || "").filter((t) => t && t.length > 5 && !choiceButtons.some((btn) => (btn.textContent || "").includes(t)));
          if (texts.length > 0) {
            questionText = texts[0] || "";
          }
        }
      }
      return {
        type: "choice",
        question: questionText || "Select setup choice",
        buttons: choiceButtons
      };
    }
    return null;
  }
  function checkIsPlayUrl() {
    return location.pathname === "/play" || location.pathname.endsWith("/play") || location.pathname.startsWith("/play/") || location.pathname.startsWith("/adventure/");
  }
  function currentShortId() {
    const isPlayUrl = checkIsPlayUrl();
    const m = location.pathname.match(/\/play\/([^/]+)/) || location.pathname.match(/\/adventure\/([^/]+)/);
    if (m) return m[1];
    const params = new URLSearchParams(location.search);
    const qId = params.get("adventureId") || params.get("adventure") || params.get("id");
    if (qId) return qId;
    if (isPlayUrl) {
      return activeShortId;
    }
    return null;
  }
  var panel = mountPanel();
  function sendBg(msg) {
    return browser.runtime.sendMessage(msg);
  }
  async function decompressSettings(payload) {
    if (payload.startsWith("gz:")) {
      const base64Data = payload.slice(3);
      const binaryString = atob(base64Data);
      const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      const response = new Response(stream);
      const text = await response.text();
      return JSON.parse(text);
    } else if (payload.startsWith("raw:")) {
      const base64Data = payload.slice(4);
      const jsonText = decodeURIComponent(escape(atob(base64Data)));
      return JSON.parse(jsonText);
    } else {
      try {
        const binaryString = atob(payload);
        const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
        if (bytes[0] === 31 && bytes[1] === 139) {
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
          const response = new Response(stream);
          const text = await response.text();
          return JSON.parse(text);
        }
        const jsonText = new TextDecoder().decode(bytes);
        return JSON.parse(jsonText);
      } catch (e) {
        return JSON.parse(payload);
      }
    }
  }
  async function checkAndImportQrSettings() {
    if (!isContextValid2()) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const importPayload = urlParams.get("importSettings");
      if (!importPayload) return;
      panel.showToast("Importing settings...");
      const settings = await decompressSettings(importPayload);
      if (settings && typeof settings === "object") {
        delete settings.apiKeys;
        delete settings.keyStatus;
        await browser.runtime.sendMessage({ kind: "setSettings", settings });
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        panel.showToast("Settings imported successfully!");
        refresh();
      } else {
        panel.showToast("Invalid settings payload.", true);
      }
    } catch (err) {
      console.error("[AID content] Failed to import QR settings:", err);
      panel.showToast("Import failed: " + (err?.message || String(err)), true);
    }
  }
  checkAndImportQrSettings();
  panel.onRefresh(() => {
    dlog("[AID content] Direct refresh requested by panel callback");
    refresh();
  });
  var count = 0;
  (async () => {
    try {
      const res = await browser.runtime.sendMessage({ kind: "isDbEmpty" });
      if (res?.empty) panel.showSelfHealBanner();
    } catch {
    }
  })();
  var debugEnabled = false;
  var _log = console.log.bind(console);
  function dlog(...args) {
    if (debugEnabled) _log(...args);
  }
  function send(msg) {
    if (!isContextValid2()) return;
    browser.runtime.sendMessage(msg).catch(() => {
    });
  }
  var actionUpdateTimeout = null;
  var accumulatedActions = [];
  var lastActionPayload = null;
  function bufferActionUpdate(sid, payload) {
    if (payload?.actions) {
      accumulatedActions.push(...payload.actions);
      lastActionPayload = payload;
    }
    if (actionUpdateTimeout) {
      clearTimeout(actionUpdateTimeout);
    }
    actionUpdateTimeout = setTimeout(() => {
      if (!isContextValid2()) return;
      if (accumulatedActions.length > 0 && lastActionPayload) {
        dlog(`[AID content] Sending debounced actionUpdate with ${accumulatedActions.length} actions.`);
        send({
          kind: "actionUpdate",
          shortId: sid,
          payload: {
            ...lastActionPayload,
            actions: accumulatedActions
          }
        });
        accumulatedActions = [];
        lastActionPayload = null;
        browser.runtime.sendMessage({ kind: "getState", shortId: sid }).then((state) => {
          if (state) {
            const actionCountVal = state.actionCount ?? state.actionsCount ?? 0;
            lastKnownActionCount = actionCountVal;
            panel.updateActionCount(
              actionCountVal,
              state.lastAnalysisAction ?? null
            );
          }
        }).catch(() => {
        });
      }
    }, 250);
  }
  var memoriesUpdateTimeout = null;
  var latestMemories = [];
  function bufferMemoriesUpdate(sid, memories) {
    latestMemories = memories;
    if (memoriesUpdateTimeout) {
      clearTimeout(memoriesUpdateTimeout);
    }
    memoriesUpdateTimeout = setTimeout(() => {
      if (!isContextValid2()) return;
      dlog(`[AID content] Sending debounced adventureMemories with ${latestMemories.length} memories.`);
      send({
        kind: "adventureMemories",
        shortId: sid,
        memories: latestMemories
      });
      panel.updateMemories(latestMemories);
      latestMemories = [];
    }, 250);
  }
  async function refreshModels(current) {
    const res = await browser.runtime.sendMessage({ kind: "listModels" });
    panel.setModels(res?.models ?? [], current);
  }
  async function refresh() {
    if (!isContextValid2()) return;
    const sid = currentShortId();
    const isPlayUrl = checkIsPlayUrl();
    let activeQuestion = isPlayUrl ? detectSetupQuestion() : null;
    if (activeQuestion || sid && isPlayUrl) {
      const targetSid = sid || activeShortId;
      let state = null;
      if (targetSid) {
        state = await browser.runtime.sendMessage({ kind: "getState", shortId: targetSid });
      } else {
        state = await browser.runtime.sendMessage({ kind: "getManagerData" });
      }
      if (state) {
        debugEnabled = !!state.settings?.showDebug;
        const actionCountVal = state.actionCount ?? state.actionsCount ?? 0;
        lastKnownActionCount = actionCountVal;
        if (actionCountVal > 0) {
          activeQuestion = null;
        }
        panel.render({
          shortId: state.shortId || targetSid || void 0,
          protagonist: state.protagonist,
          memoraidCharacters: state.memoraidCharacters ?? [],
          livingConfig: state.livingConfig ?? {},
          scenario: state.scenario ?? null,
          settings: state.settings,
          versions: state.versions ?? [],
          cards: state.cards ?? [],
          allCards: state.allCards ?? [],
          adventures: state.adventures ?? [],
          globalAssets: state.globalAssets ?? [],
          memory: state.memory ?? null,
          actionsCount: state.actionsCount,
          actionCount: state.actionCount,
          lastAnalysisAction: state.lastAnalysisAction,
          // getState emits the Memory Bank list as `memoryBankEntries` (renamed from `aidMemories`);
          // the panel prop is still `aidMemories`, so map it here. Reading state.aidMemories directly
          // resolved to undefined -> [] and blanked the list on every full refresh() (e.g. after a
          // "Regenerate Latest"), until the next live memory update repopulated it via updateMemories.
          aidMemories: state.memoryBankEntries ?? state.aidMemories ?? [],
          ops: state.ops ?? [],
          activeLocationId: state.activeLocationId ?? null,
          locationSuggestions: state.locationSuggestions ?? [],
          properNounLogs: state.properNounLogs ?? [],
          isManagerOnly: false,
          activeSetupQuestion: activeQuestion ? {
            type: activeQuestion.type,
            question: activeQuestion.question
          } : null
        });
        refreshModels(state.settings?.model);
        if (state.settings) {
          window.postMessage({
            source: "aid-extension-host",
            kind: "settingsUpdate",
            interceptTimeout: state.settings?.interceptTimeout ?? 4,
            debug: !!state.settings?.showDebug
          }, location.origin);
        }
      }
    } else {
      const state = await browser.runtime.sendMessage({ kind: "getManagerData" });
      if (state) {
        panel.render({
          isManagerOnly: true,
          adventures: state.adventures,
          cards: state.cards,
          globalAssets: state.globalAssets,
          settings: state.settings,
          versions: [],
          protagonist: null,
          activeSetupQuestion: null
        });
      }
    }
  }
  var lastShortId = null;
  var lastPath = null;
  var lastDocTitle = null;
  var lastActiveQuestionStr = "";
  function checkNavigation() {
    if (!isContextValid2()) return;
    const sid = currentShortId();
    const path = location.pathname;
    const docTitle = document.title;
    const isPlayUrl = checkIsPlayUrl();
    if (path !== lastPath) {
      const hasIdInUrl = /\/(play|adventure)\/([^/]+)/.test(path) || new URLSearchParams(location.search).has("adventureId") || new URLSearchParams(location.search).has("adventure") || new URLSearchParams(location.search).has("id");
      if (path.includes("/scenario/") || !hasIdInUrl && (path === "/play" || path.endsWith("/play"))) {
        activeShortId = null;
      }
    }
    const isNavChanged = sid !== lastShortId || path !== lastPath;
    const isTitleChanged = docTitle !== lastDocTitle;
    let shouldRefresh = isNavChanged || isTitleChanged;
    if (isPlayUrl) {
      const activeQuestion = detectSetupQuestion(lastKnownActionCount ?? void 0);
      const activeQuestionStr = activeQuestion ? JSON.stringify({ type: activeQuestion.type, question: activeQuestion.question }) : "";
      if (activeQuestionStr !== lastActiveQuestionStr) {
        lastActiveQuestionStr = activeQuestionStr;
        shouldRefresh = true;
      }
    }
    if (shouldRefresh) {
      lastShortId = sid;
      lastPath = path;
      lastDocTitle = docTitle;
      if (sid) {
        const isGeneric = !docTitle || docTitle === "AI Dungeon" || docTitle === "Untitled Adventure";
        if (isNavChanged || !isGeneric) {
          send({ kind: "adventureMeta", shortId: sid, title: isGeneric ? void 0 : docTitle });
        }
        if (isNavChanged) {
          browser.runtime.sendMessage({ kind: "getState", shortId: sid }).then((state) => {
            if (state && Array.isArray(state.cards)) {
              window.postMessage({
                source: "aid-extension-host",
                kind: "seedApprovedCards",
                cards: state.cards.map((card) => ({
                  id: card.id,
                  value: card.value,
                  description: card.description || ""
                }))
              }, location.origin);
            }
          }).catch(() => {
          });
        }
      }
      refresh();
    }
  }
  setInterval(checkNavigation, 1e3);
  checkNavigation();
  window.addEventListener("message", (ev) => {
    if (!isContextValid2()) return;
    if (ev.source !== window || ev.data?.source !== "aid-tracker") return;
    const detail = ev.data.detail;
    if (detail?.transport === "adventureLoaded") {
      const { shortId, title, memory, authorsNote, instructions, storyCards } = detail;
      activeShortId = shortId;
      browser.runtime.sendMessage({ kind: "getState", shortId }).then((state) => {
        if (state) {
          lastKnownActionCount = state.actionCount ?? state.actionsCount ?? 0;
          if (Array.isArray(state.cards)) {
            window.postMessage({
              source: "aid-extension-host",
              kind: "seedApprovedCards",
              cards: state.cards.map((card) => ({
                id: card.id,
                value: card.value,
                description: card.description || ""
              }))
            }, location.origin);
          }
        }
        const hasAdventure = state && Array.isArray(state.adventures) && state.adventures.some((a) => a.shortId === shortId);
        const isSkeleton = hasAdventure && (!state.actionCount || state.actionCount === 0);
        if ((!hasAdventure || isSkeleton) && !autoBackfillsInFlight.has(shortId) && checkIsPlayUrl()) {
          autoBackfillsInFlight.add(shortId);
          console.log(`[AID content] Auto-triggering backfill for new/skeleton adventure: ${shortId}`);
          browser.runtime.sendMessage({ kind: "backfillRequest", shortId }).then((res) => {
            console.log(`[AID content] Auto-backfill completed for ${shortId}:`, res);
            refresh();
          }).catch((err) => {
            console.error(`[AID content] Auto-backfill failed for ${shortId}:`, err);
          }).finally(() => {
            autoBackfillsInFlight.delete(shortId);
          });
        }
      }).catch(() => {
      });
      if (title || memory || authorsNote !== void 0 || instructions !== void 0) {
        send({ kind: "adventureMeta", shortId, title, memory, authorsNote, instructions });
      }
      if (Array.isArray(storyCards)) {
        const cards = storyCards.map((c) => ({
          shortId,
          id: c.id,
          type: c.type,
          title: c.title,
          keys: c.keys,
          value: c.value,
          description: c.description || "",
          deletedAt: c.deletedAt ?? null
        }));
        send({ kind: "cardsUpdate", shortId, cards, isFullList: true });
      }
      if (memory) {
        const m = memory.match(/(?:your name|player name)\s*:\s*([^\n\]]+)/i);
        const protagonistName = m ? m[1].trim() : null;
        if (protagonistName) {
          send({ kind: "setProtagonist", shortId, name: protagonistName });
        }
      }
      refresh();
      return;
    }
    if (detail?.transport === "interceptedAction") {
      browser.runtime.sendMessage({
        kind: "processInterceptedAction",
        shortId: detail.shortId,
        text: detail.text,
        type: detail.type
      }).then((res) => {
        window.postMessage({
          source: "aid-extension-host",
          kind: "actionApproved",
          requestId: detail.requestId,
          updatedNames: res?.updatedNames || [],
          injectText: res?.injectText || ""
        }, location.origin);
      }).catch((err) => {
        console.error("[AID content] Error processing intercepted action:", err);
        window.postMessage({
          source: "aid-extension-host",
          kind: "actionApproved",
          requestId: detail.requestId,
          updatedNames: []
        }, location.origin);
      });
      return;
    }
    if (detail?.transport === "auth" && detail.token) {
      send({ kind: "authToken", token: detail.token });
      return;
    }
    if (detail?.transport === "op" && Array.isArray(detail.ops)) {
      send({ kind: "learnedOp", ops: detail.ops, endpoint: detail.url });
      return;
    }
    const sid = currentShortId();
    if (!sid) return;
    if (detail?.transport === "ws") {
      dlog("[AID content] Received WS message from page:", detail.operationName, "active sid:", sid);
    }
    if (detail?.transport === "ws" && detail.operationName === "ActionUpdates") {
      const payload = detail.data?.actionUpdates;
      if (payload?.actions) {
        count += payload.actions.length;
        bufferActionUpdate(sid, payload);
      }
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "AdventureMetadataUpdate") {
      const title = detail.data?.adventureMetadataUpdate?.title;
      if (title) send({ kind: "adventureMeta", shortId: sid, title });
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "AdventureStoryCardsUpdate") {
      const raw = detail.data?.adventureStoryCardsUpdate?.storyCards;
      if (Array.isArray(raw)) {
        const cards = raw.map((c) => ({ shortId: sid, id: c.id, type: c.type, title: c.title, keys: c.keys, value: c.value, description: c.description || "", deletedAt: c.deletedAt ?? null }));
        send({ kind: "cardsUpdate", shortId: sid, cards, isFullList: true });
      }
      return;
    }
    if (detail?.transport === "authorsNoteUpdate" && detail.shortId) {
      send({ kind: "setAuthorsNote", shortId: detail.shortId, authorsNote: detail.authorsNote || "" });
      return;
    }
    if (detail?.transport === "cardWrites" && Array.isArray(detail.cards)) {
      const cards = detail.cards.filter((c) => c && c.id && (!c.shortId || c.shortId === sid)).map((c) => ({
        shortId: sid,
        id: String(c.id),
        type: c.type || "custom",
        title: c.title,
        keys: c.keys || "",
        value: c.value || "",
        description: c.description || "",
        deletedAt: null
      }));
      if (cards.length) {
        dlog("[AID content] Captured page card writes:", cards.map((c) => c.title || c.id).join(", "));
        send({ kind: "cardsUpdate", shortId: sid, cards, isFullList: false });
      }
      return;
    }
    if (detail?.transport === "cardDeletes" && Array.isArray(detail.ids)) {
      const ids = detail.ids.map((x) => String(x)).filter(Boolean);
      if (ids.length) {
        dlog("[AID content] Captured page card deletions:", ids.join(", "));
        browser.runtime.sendMessage({ kind: "cardsDeleted", shortId: sid, cardIds: ids }).then(() => refresh()).catch(() => {
        });
      }
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "Memory") {
      const memory = detail.data?.memory?.memory;
      if (memory) {
        dlog("[AID content] Captured real-time memory from WebSocket subscription:", memory.length);
        send({ kind: "adventureMeta", shortId: sid, memory });
      }
      return;
    }
    if (detail?.transport === "ws" && detail.operationName === "AdventureMemoriesUpdate") {
      const memories = detail.data?.adventureMemoriesUpdate?.memories;
      if (Array.isArray(memories) && memories.length > 0) {
        dlog("[AID content] Captured real-time adventure memories update. count:", memories.length);
        bufferMemoriesUpdate(sid, memories);
      }
      return;
    }
  });
  panel.onExport(async (type) => {
    const sid = currentShortId();
    if (!sid) return;
    const backup = await browser.runtime.sendMessage({ kind: "exportRequest", shortId: sid });
    if (backup == null) {
      panel.showToast("Nothing to export yet", true);
      return;
    }
    let blob;
    let filename;
    if (type === "story") {
      const actions = backup.actions || [];
      blob = new Blob([JSON.stringify(actions, null, 2)], { type: "application/json" });
      filename = `aid-story-${sid}.json`;
    } else if (type === "cards") {
      const cards = backup.cards || [];
      blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
      filename = `aid-storycards-${sid}.json`;
    } else if (type === "pe") {
      const memory = backup.adventure?.memory || "";
      blob = new Blob([memory], { type: "text/plain" });
      filename = `aid-pe-${sid}.txt`;
    } else if (type === "aidmemories") {
      const aidMemories = backup.adventure?.memoryBankEntries || backup.adventure?.aidMemories || [];
      blob = new Blob([JSON.stringify(aidMemories, null, 2)], { type: "application/json" });
      filename = `aid-memories-${sid}.json`;
    } else if (type === "propernouns") {
      const logs = backup.adventure?.properNounLogs || [];
      blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
      filename = `aid-propernouns-${sid}.json`;
    } else {
      blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      filename = `aid-all-${sid}.json`;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    panel.showToast("Data exported successfully!");
    setTimeout(() => URL.revokeObjectURL(a.href), 5e3);
  });
  panel.onBackupAll(async () => {
    try {
      const dump = await browser.runtime.sendMessage({ kind: "exportAll" });
      if (!dump || dump.error || !dump.__aidBackup) {
        panel.showToast(dump?.error || "Backup failed", true);
        return;
      }
      const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `aid-story-helper-backup-${stamp}.json`;
      a.click();
      const total = Object.values(dump.stores || {}).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0);
      panel.showToast(`Backed up ${total} records. Keep this file private \u2014 it contains your settings/API keys.`);
      setTimeout(() => URL.revokeObjectURL(a.href), 5e3);
    } catch (err) {
      panel.showToast(err?.message || String(err), true);
    }
  });
  panel.onRestoreAll(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const res = await browser.runtime.sendMessage({ kind: "importAll", data });
        if (res?.error) {
          panel.showToast(res.error, true);
          return;
        }
        const total = Object.values(res?.counts || {}).reduce((n, c) => n + (Number(c) || 0), 0);
        panel.showToast(`Restored ${total} records. Reloading\u2026`);
        setTimeout(() => location.reload(), 1200);
      } catch (err) {
        panel.showToast(`Restore failed: ${err?.message || String(err)}`, true);
      }
    }, { once: true });
    input.click();
  });
  panel.onBackfill(async () => {
    const sid = currentShortId();
    if (!sid) return;
    panel.setStatus(`Backfilling story\u2026`);
    try {
      const res = await browser.runtime.sendMessage({ kind: "backfillRequest", shortId: sid });
      if (res && typeof res.loaded === "number") {
        panel.setStatus(`Backfilled ${res.loaded} actions`);
        panel.showToast("Backfill complete!");
      } else {
        panel.setStatus(`${res?.error ?? "Backfill failed"}`);
        panel.showToast("Backfill failed!", true);
      }
    } catch (err) {
      console.error("[AID content] Backfill request failed:", err);
      panel.setStatus(`Backfill failed: ${err?.message || err}`);
      panel.showToast("Backfill failed!", true);
    }
    refresh();
  });
  panel.onSaveSettings(async (settings, protagonist) => {
    await browser.runtime.sendMessage({ kind: "setSettings", settings });
    const sid = currentShortId();
    if (sid && protagonist) {
      await browser.runtime.sendMessage({ kind: "setProtagonist", shortId: sid, name: protagonist });
    }
    window.postMessage({
      source: "aid-extension-host",
      kind: "settingsUpdate",
      interceptTimeout: settings.interceptTimeout,
      debug: !!settings.showDebug
    }, location.origin);
    panel.showToast("Settings saved!");
    refreshModels(settings.model || void 0);
    refresh();
  });
  panel.on("themeChange", async (theme) => {
    const settings = { theme };
    await browser.runtime.sendMessage({ kind: "setSettings", settings });
  });
  panel.on("analyze", async () => {
    const sid = currentShortId();
    if (!sid) return;
    const res = await browser.runtime.sendMessage({ kind: "analyzeRequest", shortId: sid });
    panel.showAnalyzeResult(res);
    if (res?.error) panel.showToast("Update failed!", true);
    await refresh();
    panel.showDebug(res?.debug);
  });
  panel.on("generateCard", async (cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.showToast("Generating via AI Dungeon\u2026");
    const res = await browser.runtime.sendMessage({ kind: "generateCard", shortId: sid, cardId });
    if (res?.error) panel.showToast(`Generate failed: ${res.error}`, true);
    else if (res?.id) panel.showToast(`Proposal ready for ${res.characterName} \u2014 review & approve.`);
    await refresh();
  });
  panel.on("generateCompactCard", async (cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.showToast("Generating compact description via AI Dungeon\u2026");
    const res = await browser.runtime.sendMessage({ kind: "generateCompactCard", shortId: sid, cardId });
    if (res?.error) panel.showToast(`Compact generate failed: ${res.error}`, true);
    else if (res?.id) panel.showToast(`Compact proposal ready for ${res.characterName} \u2014 review & approve.`);
    await refresh();
  });
  panel.on("rerollAppearance", async (cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.showToast("Re-rolling body via AI Dungeon\u2026");
    const res = await browser.runtime.sendMessage({ kind: "rerollAppearance", shortId: sid, cardId });
    if (res?.error) panel.showToast(`Re-roll failed: ${res.error}`, true);
    else if (res?.id) panel.showToast(`Re-rolled body ready for ${res.characterName} \u2014 review & approve.`);
    await refresh();
  });
  panel.on("distillCrystallized", async (cardId, charName) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.showToast(`Distilling long-term memory for ${charName}...`);
    const res = await sendBg({ kind: "distillCrystallized", shortId: sid, cardId, name: charName });
    if (res?.error) panel.showToast(`Distillation failed: ${res.error}`, true);
    else panel.showToast(`Distillation complete for ${charName}!`);
    panel.clearCrystallizedSchemaCache(cardId);
    await refresh();
  });
  panel.on("backfillNpcMemories", async (charName) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.showToast(`Backfilling ${charName}'s memories from native memory blocks...`);
    sendBg({ kind: "backfillNpcMemories", shortId: sid, characterTitle: charName }).then((res) => {
      if (res?.error) panel.showToast(`Backfill failed: ${res.error}`, true);
    }).catch(() => {
    });
  });
  panel.on("getNpcMemoryBank", async (charName) => {
    const sid = currentShortId();
    if (!sid) return { blocks: [] };
    return await sendBg({ kind: "getNpcMemoryBank", shortId: sid, characterTitle: charName });
  });
  panel.on("saveNpcMemoryBlock", async (charName, blockId, povText) => {
    const sid = currentShortId();
    if (!sid) return { error: "No adventure." };
    const res = await sendBg({ kind: "saveNpcMemoryBlock", shortId: sid, characterTitle: charName, blockId, povText });
    if (res?.error) panel.showToast(`Save failed: ${res.error}`, true);
    else panel.showToast("Memory saved.");
    return res;
  });
  panel.on("deleteNpcMemoryBlock", async (charName, blockId) => {
    const sid = currentShortId();
    if (!sid) return { error: "No adventure." };
    const res = await sendBg({ kind: "deleteNpcMemoryBlock", shortId: sid, characterTitle: charName, blockId });
    if (res?.error) panel.showToast(`Delete failed: ${res.error}`, true);
    return res;
  });
  panel.on("regenerateNpcMemoryBlock", async (charName, blockId) => {
    const sid = currentShortId();
    if (!sid) return { error: "No adventure." };
    const res = await sendBg({ kind: "regenerateNpcMemoryBlock", shortId: sid, characterTitle: charName, blockId });
    if (res?.error) panel.showToast(`Regenerate failed: ${res.error}`, true);
    return res;
  });
  panel.on("consolidateOutlook", async (charName) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.showToast(`Consolidating ${charName}'s Outlook into their card...`);
    const res = await sendBg({ kind: "consolidateOutlook", shortId: sid, characterTitle: charName });
    if (res?.error) panel.showToast(`Consolidation failed: ${res.error}`, true);
    else {
      const n = res?.incorporated ?? 0;
      panel.showToast(n > 0 ? `Proposed a card revision folding in ${n} belief${n === 1 ? "" : "s"} \u2014 review & approve.` : `No settled beliefs to consolidate for ${charName}.`);
    }
    await refresh();
  });
  async function handleSuccessfulPush(res) {
    if (res?.ok && res.source === "card" && res.cardId && (typeof res.value === "string" || res.deletedAt)) {
      dlog("[AID content] Successful card push detected. Notifying injected script to sync Apollo cache...");
      window.postMessage({
        source: "aid-extension-host",
        kind: "approvedCard",
        cardId: res.cardId,
        value: res.value,
        description: res.description,
        keys: res.keys,
        prevKeys: res.prevKeys,
        deletedAt: res.deletedAt,
        blockAutosave: res.blockAutosave
      }, location.origin);
    } else if (res?.ok && res.source === "plot" && typeof res.memory === "string") {
      dlog("[AID content] Successful plot push detected. Notifying injected script to sync Apollo cache...");
      const sid = currentShortId();
      if (sid) {
        window.postMessage({
          source: "aid-extension-host",
          kind: "approvedMemory",
          shortId: sid,
          memory: res.memory
        }, location.origin);
      }
    }
  }
  panel.on("proposalDecision", async (id, status) => {
    try {
      const res = await sendBg({ kind: "setVersionStatus", id, status });
      if (status === "applied") {
        if (res?.ok) {
          panel.showToast("Approved & pushed to AI Dungeon!");
          await handleSuccessfulPush(res);
        } else {
          panel.showToast(`Approved locally \u2014 push failed: ${res?.error || "unknown error"}`, true);
        }
      }
    } catch (err) {
      panel.showToast(`Approved locally \u2014 push error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.on("pushVersion", async (id) => {
    dlog("[AID content] onPushVersion handler triggered for id:", id);
    panel.setStatus("Pushing update to AI Dungeon\u2026");
    try {
      const res = await sendBg({ kind: "applyToAid", id });
      dlog("[AID content] applyToAid response received:", res);
      if (res?.ok) {
        panel.setStatus("Push successful!");
        panel.showToast("Push successful!");
        await handleSuccessfulPush(res);
      } else {
        panel.setStatus(`Push failed: ${res?.error || "Unknown error"}`);
        panel.showToast(`Push failed: ${res?.error || "Unknown error"}`, true);
      }
    } catch (err) {
      console.error("[AID content] Error during applyToAid sendMessage:", err);
      panel.setStatus(`Push failed: ${err?.message || err || "Communication error"}`);
      panel.showToast("Communication error!", true);
    }
    refresh();
  });
  panel.on("updateAidMemories", async (memories) => {
    const sid = currentShortId();
    if (!sid) return;
    await browser.runtime.sendMessage({ kind: "updateAidMemories", shortId: sid, memories });
    refresh();
  });
  panel.on("setMemoraidCharacters", async (characters) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    try {
      const res = await sendBg({ kind: "setMemoraidCharacters", shortId: sid, characters });
      refresh();
      if (res?.ok) return { ok: true };
      return { error: res?.error || "unknown error" };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.on("setLivingConfig", async (config, protagonistName) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    try {
      const res = await sendBg({ kind: "setLivingConfig", shortId: sid, config });
      if (protagonistName) await browser.runtime.sendMessage({ kind: "setProtagonist", shortId: sid, name: protagonistName });
      refresh();
      if (res?.ok) return { ok: true };
      return { error: res?.error || "unknown error" };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.on("createStoryCard", async (card) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    panel.setStatus("Creating story card...");
    try {
      const res = await sendBg({ kind: "createStoryCard", shortId: sid, card });
      refresh();
      if (res?.ok) {
        return { ok: true };
      } else {
        return { error: res?.error || "unknown error" };
      }
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.on("saveCardKeys", async (cardId, keys) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    panel.setStatus("Saving card triggers...");
    try {
      const res = await sendBg({ kind: "saveCardKeys", shortId: sid, cardId, keys });
      refresh();
      if (res?.ok) {
        return { ok: true };
      } else {
        return { error: res?.error || "unknown error" };
      }
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.on("saveCardValue", async (cardId, value) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    panel.setStatus("Saving card entry...");
    try {
      const res = await sendBg({ kind: "saveCardValue", shortId: sid, cardId, value });
      refresh();
      if (res?.ok) {
        return { ok: true };
      } else {
        return { error: res?.error || "unknown error" };
      }
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.on("saveCrystallizedSchema", async (cardId, schema) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    try {
      const res = await sendBg({ kind: "saveCrystallizedSchema", shortId: sid, cardId, schema });
      refresh();
      if (res?.ok) {
        panel.showToast("Knows updated.");
      }
      return res || { error: "No response" };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  });
  panel.on("savePreferences", async (cardId, prefs) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    try {
      const res = await sendBg({ kind: "savePreferences", shortId: sid, cardId, prefs });
      refresh();
      if (res?.ok) {
        panel.showToast("Preferences updated.");
      }
      return res || { error: "No response" };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  });
  panel.on("consolidateCrystallized", async (cardId) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    try {
      const res = await sendBg({ kind: "consolidateCrystallizedSchema", shortId: sid, cardId });
      refresh();
      if (res?.ok) {
        panel.showToast("Schema consolidated.");
      }
      return res || { error: "No response" };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  });
  panel.on("getCrystallizedSchema", async (cardId) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    try {
      const res = await sendBg({ kind: "getCrystallizedState", shortId: sid, cardId });
      return res || { error: "No response" };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  });
  panel.on("deleteStoryCard", async (cardId) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    panel.setStatus("Deleting story card...");
    try {
      const res = await sendBg({ kind: "deleteStoryCard", shortId: sid, cardId });
      refresh();
      if (res?.ok) {
        return { ok: true };
      } else {
        return { error: res?.error || "unknown error" };
      }
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.on("setLifeCardStatus", async (cardId, status) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    panel.setStatus(status === "resolved" ? "Resolving relationship..." : `Setting relationship ${status}...`);
    try {
      const res = await sendBg({ kind: "setLifeCardStatus", shortId: sid, cardId, status });
      refresh();
      if (res?.ok) return { ok: true };
      return { error: res?.error || "unknown error" };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.on("enqueueLifeInjection", async (owner, target, pressure, momentum) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure shortId found" };
    try {
      return await sendBg({ kind: "enqueueLifeInjection", shortId: sid, owner, target, pressure, momentum }) || { error: "No response" };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
  panel.onRefineMemoryBlock(async (index) => {
    const sid = currentShortId();
    if (!sid) return;
    panel.setStatus(`Regenerating memory block #${index + 1}...`);
    try {
      const res = await sendBg({ kind: "refineMemoryBlock", shortId: sid, index });
      if (res?.ok) {
        panel.showToast(`Memory block #${index + 1} regenerated and pushed to AID!`);
      } else {
        panel.showToast(`Refinement failed: ${res?.error || "unknown error"}`, true);
      }
    } catch (err) {
      panel.showToast(`Refinement error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.onGrantPermissions(() => {
    panel.showToast("Opening permissions tab...");
    browser.runtime.sendMessage({ kind: "openPermissionsPage" }).then((res) => {
      if (!res || !res.ok) {
        panel.showToast("Failed to open permissions tab: " + (res?.error || "unknown error"), true);
      }
    }).catch((err) => {
      panel.showToast("Failed to open permissions tab: " + err.message, true);
    });
  });
  panel.on("setActiveLocation", async (cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      const res = await sendBg({ kind: "setActiveLocation", shortId: sid, cardId });
      if (res?.error) {
        panel.showToast(`Failed to set location: ${res.error}`, true);
      } else {
        panel.showToast(cardId ? "Active location updated." : "Active location cleared.");
      }
    } catch (err) {
      panel.showToast(`Failed to set location: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.on("respondToProperNounSuggestion", async (properNoun, accept, type) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      const res = await sendBg({ kind: "respondToProperNounSuggestion", shortId: sid, properNoun, accept, type });
      if (res?.error) {
        panel.showToast(`Suggestion response failed: ${res.error}`, true);
      } else if (accept) {
        panel.showToast(`"${properNoun}" recorded as ${type}.`);
      }
    } catch (err) {
      panel.showToast(`Suggestion response error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.on("updateProperNounLog", async (properNoun, type) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      await browser.runtime.sendMessage({ kind: "updateProperNounLog", shortId: sid, properNoun, type });
    } catch {
    }
    refresh();
  });
  panel.on("linkProperNounToCard", async (properNoun, cardId) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      const res = await sendBg({ kind: "linkProperNounToCard", shortId: sid, properNoun, cardId });
      if (res?.error) {
        panel.showToast(`Link failed: ${res.error}`, true);
      } else {
        panel.showToast(`"${properNoun}" linked to its card.`);
      }
    } catch (err) {
      panel.showToast(`Link error: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.on("deleteProperNounLog", async (properNoun) => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      await browser.runtime.sendMessage({ kind: "deleteProperNounLog", shortId: sid, properNoun });
    } catch {
    }
    refresh();
  });
  panel.on("clearProperNounLogs", async () => {
    const sid = currentShortId();
    if (!sid) return;
    try {
      await browser.runtime.sendMessage({ kind: "clearProperNounLogs", shortId: sid });
      panel.showToast("Proper noun logs cleared.");
    } catch (err) {
      panel.showToast(`Failed to clear logs: ${err?.message || err}`, true);
    }
    refresh();
  });
  panel.on("applyInstruction", () => {
    refresh();
  });
  panel.on("saveGlobalAsset", async (asset) => {
    const res = await browser.runtime.sendMessage({ kind: "saveGlobalAsset", asset });
    refresh();
    return res;
  });
  panel.on("deleteGlobalAsset", async (id) => {
    const res = await browser.runtime.sendMessage({ kind: "deleteGlobalAsset", id });
    refresh();
    return res;
  });
  panel.on("importGlobalAsset", async (assetId) => {
    const sid = currentShortId();
    if (!sid) return { error: "No active adventure." };
    const res = await browser.runtime.sendMessage({ kind: "importGlobalAsset", shortId: sid, assetId });
    refresh();
    return res;
  });
  panel.on("fillSetupValue", (value) => {
    const activeQuestion = detectSetupQuestion();
    if (!activeQuestion || activeQuestion.type !== "text" || !activeQuestion.inputEl) {
      panel.showToast("No active text input question found to fill.", true);
      return;
    }
    window.postMessage({
      source: "aid-extension-host",
      kind: "fillSetupInput",
      value
    }, location.origin);
    panel.showToast(`Filled "${value.length > 20 ? value.slice(0, 20) + "..." : value}"`);
  });
  browser.runtime.onMessage.addListener((msg) => {
    if (!isContextValid2()) return;
    if (msg && msg.kind === "approvedCardSync") {
      handleSuccessfulPush(msg.payload);
      if (msg.payload?.cardId) panel.clearCrystallizedSchemaCache(msg.payload.cardId);
      refresh();
      return;
    }
    if (msg && msg.kind === "stateUpdated") {
      dlog(`[AID content] State updated received from background. Refreshing...`);
      if (msg.type && typeof msg.text === "string") {
        window.postMessage({
          source: "aid-extension-host",
          kind: "approvedState",
          shortId: msg.shortId,
          type: msg.type,
          text: msg.text,
          previousText: msg.previousText
        }, location.origin);
      }
      refresh();
      return;
    }
    if (msg && msg.kind === "memoryUpdated") {
      dlog(`[AID content] Memory update received from background. Notifying injected script...`);
      window.postMessage({
        source: "aid-extension-host",
        kind: "approvedMemory",
        shortId: msg.shortId,
        memory: msg.memory,
        previousMemory: msg.previousMemory
      }, location.origin);
      refresh();
      return;
    }
    if (msg && msg.kind === "proposalCreated") {
      dlog(`[AID content] Auto-update proposal created for character: ${msg.characterName}. Refreshing...`);
      refresh();
      return;
    }
    if (msg && msg.kind === "npcMemoryProgress") {
      panel.refreshNpcMemory(msg.characterTitle, msg.generated, msg.remaining, msg.done, msg.block);
      return;
    }
    if (msg && msg.kind === "relayFetch") {
      return new Promise((resolve) => {
        const requestId = Math.random().toString(36).substring(7);
        const listener = (ev) => {
          if (ev.origin !== location.origin || ev.data?.source !== "aid-extension-host") return;
          if (ev.data?.kind === "relayFetchResponse" && ev.data.requestId === requestId) {
            window.removeEventListener("message", listener);
            resolve(ev.data.response);
          }
        };
        window.addEventListener("message", listener);
        window.postMessage({
          source: "aid-extension-host-relay",
          kind: "relayFetchRequest",
          requestId,
          url: msg.url,
          init: msg.init
        }, location.origin);
      });
    }
  });
  window.addEventListener("aid-refresh-panel", () => {
    dlog("[AID content] Direct refresh requested by panel");
    refresh();
  });
})();
