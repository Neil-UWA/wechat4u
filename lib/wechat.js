'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _core = require('./core');

var _core2 = _interopRequireDefault(_core);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _util = require('./util');

var _contact = require('./interface/contact');

var _contact2 = _interopRequireDefault(_contact);

var _message = require('./interface/message');

var _message2 = _interopRequireDefault(_message);

var _debug2 = require('debug');

var _debug3 = _interopRequireDefault(_debug2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = (0, _debug3.default)('wechat');

if (!_util.isStandardBrowserEnv) {
  process.on('uncaughtException', function (err) {
    console.log('uncaughtException', err);
  });
}

var Wechat = function (_WechatCore) {
  _inherits(Wechat, _WechatCore);

  function Wechat(data) {
    _classCallCheck(this, Wechat);

    var _this = _possibleConstructorReturn(this, (Wechat.__proto__ || Object.getPrototypeOf(Wechat)).call(this, data));

    _lodash2.default.extend(_this, new _events2.default());
    _this.state = _this.CONF.STATE.init;
    _this.contacts = {}; // 所有联系人
    _this.Contact = (0, _contact2.default)(_this);
    _this.Message = (0, _message2.default)(_this);
    _this.lastSyncTime = 0;
    _this.syncPollingId = 0;
    _this.syncErrorCount = 0;
    _this.checkPollingId = 0;
    _this.retryPollingId = 0;
    return _this;
  }

  _createClass(Wechat, [{
    key: 'sendMsg',
    value: function sendMsg(msg, toUserName) {
      var _this2 = this;

      if ((typeof msg === 'undefined' ? 'undefined' : _typeof(msg)) !== 'object') {
        return this.sendText(msg, toUserName);
      } else if (msg.emoticonMd5) {
        return this.sendEmoticon(msg.emoticonMd5, toUserName);
      } else {
        return this.uploadMedia(msg.file, msg.filename, toUserName).then(function (res) {
          switch (res.ext) {
            case 'bmp':
            case 'jpeg':
            case 'jpg':
            case 'png':
              return _this2.sendPic(res.mediaId, toUserName);
            case 'gif':
              return _this2.sendEmoticon(res.mediaId, toUserName);
            case 'mp4':
              return _this2.sendVideo(res.mediaId, toUserName);
            default:
              return _this2.sendDoc(res.mediaId, res.name, res.size, res.ext, toUserName);
          }
        });
      }
    }
  }, {
    key: 'syncPolling',
    value: function syncPolling() {
      var _this3 = this;

      var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : ++this.syncPollingId;

      if (this.state !== this.CONF.STATE.login || this.syncPollingId !== id) {
        return;
      }
      this.syncCheck().then(function (selector) {
        debug('Sync Check Selector: ', selector);
        if (+selector !== _this3.CONF.SYNCCHECK_SELECTOR_NORMAL) {
          return _this3.sync().then(function (data) {
            _this3.syncErrorCount = 0;
            _this3.handleSync(data);
          });
        }
      }).then(function () {
        _this3.lastSyncTime = Date.now();
        _this3.syncPolling(id);
      }).catch(function (err) {
        if (_this3.state !== _this3.CONF.STATE.login) {
          return;
        }
        debug(err);
        _this3.emit('error', err);
        if (++_this3.syncErrorCount > 2) {
          var _err = new Error('\u8FDE\u7EED' + _this3.syncErrorCount + '\u6B21\u540C\u6B65\u5931\u8D25\uFF0C5s\u540E\u5C1D\u8BD5\u91CD\u542F');
          debug(_err);
          _this3.emit('error', _err);
          clearTimeout(_this3.retryPollingId);
          setTimeout(function () {
            return _this3.restart();
          }, 5 * 1000);
        } else {
          clearTimeout(_this3.retryPollingId);
          _this3.retryPollingId = setTimeout(function () {
            return _this3.syncPolling(id);
          }, 2000 * _this3.syncErrorCount);
        }
      });
    }
  }, {
    key: '_getContact',
    value: function _getContact() {
      var _this4 = this;

      var Seq = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;

      var contacts = [];
      return this.getContact(Seq).then(function (res) {
        contacts = res.MemberList || [];
        if (res.Seq) {
          return _this4._getContact(res.Seq).then(function (_contacts) {
            return contacts = contacts.concat(_contacts || []);
          });
        }
      }).then(function () {
        if (Seq == 0) {
          var emptyGroup = contacts.filter(function (contact) {
            return contact.UserName.startsWith('@@') && contact.MemberCount == 0;
          });
          if (emptyGroup.length != 0) {
            return _this4.batchGetContact(emptyGroup).then(function (_contacts) {
              return contacts = contacts.concat(_contacts || []);
            });
          } else {
            return contacts;
          }
        } else {
          return contacts;
        }
      }).catch(function (err) {
        _this4.emit('error', err);
        return contacts;
      });
    }
  }, {
    key: '_init',
    value: function _init() {
      var _this5 = this;

      return this.init().then(function (data) {
        // this.getContact() 这个接口返回通讯录中的联系人（包括已保存的群聊）
        // 临时的群聊会话在初始化的接口中可以获取，因此这里也需要更新一遍 contacts
        // 否则后面可能会拿不到某个临时群聊的信息
        _this5.updateContacts(data.ContactList);

        _this5.notifyMobile().catch(function (err) {
          return _this5.emit('error', err);
        });
        _this5._getContact().then(function (contacts) {
          debug('getContact count: ', contacts.length);
          _this5.updateContacts(contacts);
        });
        _this5.state = _this5.CONF.STATE.login;
        _this5.lastSyncTime = Date.now();
        _this5.syncPolling();
        _this5.checkPolling();
        _this5.emit('login');
      });
    }
  }, {
    key: '_login',
    value: function _login() {
      var _this6 = this;

      var checkLogin = function checkLogin() {
        return _this6.checkLogin().then(function (res) {
          if (res.code === 201 && res.userAvatar) {
            _this6.emit('user-avatar', res.userAvatar);
          }
          if (res.code !== 200) {
            debug('checkLogin: ', res.code);
            return checkLogin();
          } else {
            return res;
          }
        });
      };
      return this.getUUID().then(function (uuid) {
        debug('getUUID: ', uuid);
        _this6.emit('uuid', uuid);
        _this6.state = _this6.CONF.STATE.uuid;
        return checkLogin();
      }).then(function (res) {
        debug('checkLogin: ', res.redirect_uri);
        return _this6.login();
      });
    }
  }, {
    key: 'start',
    value: function start() {
      var _this7 = this;

      debug('启动中...');
      return this._login().then(function () {
        return _this7._init();
      }).catch(function (err) {
        debug(err);
        _this7.emit('error', err);
        _this7.stop();
      });
    }
  }, {
    key: 'restart',
    value: function restart() {
      var _this8 = this;

      debug('重启中...');
      return this._init().catch(function (err) {
        if (err.response) {
          throw err;
        } else {
          var _err2 = new Error('重启时网络错误，60s后进行最后一次重启');
          debug(_err2);
          _this8.emit('error', _err2);
          return new Promise(function (resolve) {
            setTimeout(resolve, 60 * 1000);
          }).then(function () {
            return _this8.init();
          }).then(function (data) {
            _this8.updateContacts(data.ContactList);
          });
        }
      }).catch(function (err) {
        debug(err);
        _this8.emit('error', err);
        _this8.stop();
      });
    }
  }, {
    key: 'stop',
    value: function stop() {
      debug('登出中...');
      clearTimeout(this.retryPollingId);
      clearTimeout(this.checkPollingId);
      this.logout();
      this.state = this.CONF.STATE.logout;
      this.emit('logout');
    }
  }, {
    key: 'checkPolling',
    value: function checkPolling() {
      var _this9 = this;

      if (this.state !== this.CONF.STATE.login) {
        return;
      }
      var interval = Date.now() - this.lastSyncTime;
      if (interval > 1 * 60 * 1000) {
        var err = new Error('\u72B6\u6001\u540C\u6B65\u8D85\u8FC7' + interval / 1000 + 's\u672A\u54CD\u5E94\uFF0C5s\u540E\u5C1D\u8BD5\u91CD\u542F');
        debug(err);
        this.emit('error', err);
        clearTimeout(this.checkPollingId);
        setTimeout(function () {
          return _this9.restart();
        }, 5 * 1000);
      } else {
        debug('心跳');
        this.notifyMobile().catch(function (err) {
          debug(err);
          _this9.emit('error', err);
        })
        // this.sendMsg(this._getPollingMessage(), this._getPollingTarget())
        .catch(function (err) {
          debug(err);
          _this9.emit('error', err);
        });
        clearTimeout(this.checkPollingId);
        this.checkPollingId = setTimeout(function () {
          return _this9.checkPolling();
        }, this._getPollingInterval());
      }
    }
  }, {
    key: 'handleSync',
    value: function handleSync(data) {
      if (!data) {
        this.restart();
        return;
      }
      if (data.AddMsgCount) {
        debug('syncPolling messages count: ', data.AddMsgCount);
        this.handleMsg(data.AddMsgList);
      }
      if (data.ModContactCount) {
        debug('syncPolling ModContactList count: ', data.ModContactCount);
        this.updateContacts(data.ModContactList);
      }
    }
  }, {
    key: 'handleMsg',
    value: function handleMsg(data) {
      var _this10 = this;

      data.forEach(function (msg) {
        Promise.resolve().then(function () {
          if (!_this10.contacts[msg.FromUserName] || msg.FromUserName.startsWith('@@') && _this10.contacts[msg.FromUserName].MemberCount == 0) {
            return _this10.batchGetContact([{
              UserName: msg.FromUserName
            }]).then(function (contacts) {
              _this10.updateContacts(contacts);
            }).catch(function (err) {
              debug(err);
              _this10.emit('error', err);
            });
          }
        }).then(function () {
          msg = _this10.Message.extend(msg);
          _this10.emit('message', msg);
          if (msg.MsgType === _this10.CONF.MSGTYPE_STATUSNOTIFY) {
            var userList = msg.StatusNotifyUserName.split(',').filter(function (UserName) {
              return !_this10.contacts[UserName];
            }).map(function (UserName) {
              return {
                UserName: UserName
              };
            });
            Promise.all(_lodash2.default.chunk(userList, 50).map(function (list) {
              return _this10.batchGetContact(list).then(function (res) {
                debug('batchGetContact data length: ', res.length);
                _this10.updateContacts(res);
              });
            })).catch(function (err) {
              debug(err);
              _this10.emit('error', err);
            });
          }
          if (msg.ToUserName === 'filehelper' && msg.Content === '退出wechat4u' || /^(.\udf1a\u0020\ud83c.){3}$/.test(msg.Content)) {
            _this10.stop();
          }
        }).catch(function (err) {
          _this10.emit('error', err);
          debug(err);
        });
      });
    }
  }, {
    key: 'updateContacts',
    value: function updateContacts(contacts) {
      var _this11 = this;

      if (!contacts || contacts.length == 0) {
        return;
      }
      contacts.forEach(function (contact) {
        if (_this11.contacts[contact.UserName]) {
          var oldContact = _this11.contacts[contact.UserName];
          // 清除无效的字段
          for (var i in contact) {
            contact[i] || delete contact[i];
          }
          Object.assign(oldContact, contact);
          _this11.Contact.extend(oldContact);
        } else {
          _this11.contacts[contact.UserName] = _this11.Contact.extend(contact);
        }
      });
      this.emit('contacts-updated', contacts);
    }
  }, {
    key: '_getPollingMessage',
    value: function _getPollingMessage() {
      // Default polling message
      return '心跳：' + new Date().toLocaleString();
    }
  }, {
    key: '_getPollingInterval',
    value: function _getPollingInterval() {
      // Default polling interval
      return 5 * 60 * 1000;
    }
  }, {
    key: '_getPollingTarget',
    value: function _getPollingTarget() {
      // Default polling target user
      return 'filehelper';
    }
  }, {
    key: 'setPollingMessageGetter',
    value: function setPollingMessageGetter(func) {
      if (typeof func !== 'function') return;
      if (typeof func() !== 'string') return;
      this._getPollingMessage = func;
    }
  }, {
    key: 'setPollingIntervalGetter',
    value: function setPollingIntervalGetter(func) {
      if (typeof func !== 'function') return;
      if (typeof func() !== 'number') return;
      this._getPollingInterval = func;
    }
  }, {
    key: 'setPollingTargetGetter',
    value: function setPollingTargetGetter(func) {
      if (typeof func !== 'function') return;
      if (typeof func() !== 'string') return;
      this._getPollingTarget = func;
    }
  }, {
    key: 'friendList',
    get: function get() {
      var members = [];

      for (var key in this.contacts) {
        var member = this.contacts[key];
        members.push({
          username: member['UserName'],
          nickname: this.Contact.getDisplayName(member),
          py: member['RemarkPYQuanPin'] ? member['RemarkPYQuanPin'] : member['PYQuanPin'],
          avatar: member.AvatarUrl
        });
      }

      return members;
    }
  }]);

  return Wechat;
}(_core2.default);

Wechat.STATE = (0, _util.getCONF)().STATE;

exports = module.exports = Wechat;
//# sourceMappingURL=wechat.js.map