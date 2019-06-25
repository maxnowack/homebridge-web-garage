var Service, Characteristic
const request = require('request')
const packageJson = require('./package.json')
const ip = require('ip')
const http = require('http')

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-web-garage', 'GarageDoorOpener', GarageDoorOpener)
}

function GarageDoorOpener (log, config) {
  this.log = log

  this.name = config.name
  this.apiroute = config.apiroute
  this.port = config.port || 2000

  this.autoLock = config.autoLock || false
  this.autoLockDelay = config.autoLockDelay || 10

  this.manufacturer = config.manufacturer || packageJson.author.name
  this.serial = config.serial || packageJson.version
  this.model = config.model || packageJson.name
  this.firmware = config.firmware || packageJson.version

  this.username = config.username || null
  this.password = config.password || null
  this.timeout = config.timeout || 3000
  this.http_method = config.http_method || 'GET'

  this.requestArray = ['targetDoorState', 'currentDoorState', 'obstructionDetected']

  if (this.username != null && this.password != null) {
    this.auth = {
      user: this.username,
      pass: this.password
    }
  }

  this.server = http.createServer(function (request, response) {
    var parts = request.url.split('/')
    var partOne = parts[parts.length - 2]
    var partTwo = parts[parts.length - 1]
    if (parts.length === 3 && this.requestArray.indexOf(partOne) >= 0 && partTwo.length === 1) {
      this.log('[*] Handling request: %s', request.url)
      response.end('Handling request')
      this._httpHandler(partOne, partTwo)
    } else {
      this.log.warn('[!] Invalid request: %s', request.url)
      response.end('Invalid request')
    }
  }.bind(this))

  this.server.listen(this.port, function () {
    this.log('Listen server: http://%s:%s', ip.address(), this.port)
  }.bind(this))

  this.log('%s initialized', this.name)

  this.service = new Service.GarageDoorOpener(this.name)
}

GarageDoorOpener.prototype = {

  identify: function (callback) {
    this.log('Identify requested!')
    callback()
  },

  _httpHandler: function (characteristic, value) {
    this.log('[*] Updating %s to: %s', characteristic, value)
    if (characteristic === 'currentDoorState') {
      this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(value)
    } else if (characteristic === 'targetDoorState') {
      this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(value)
      if (parseInt(value) === 0 && this.autoLock) {
        this.autoLockFunction()
      }
    } else if (characteristic === 'obstructionDetected') {
      this.service.getCharacteristic(Characteristic.ObstructionDetected).updateValue(value)
    } else {
      this.log.warn('[!] Error: Unknown characteristic "%s" with value "%s"', characteristic, value)
    }
  },

  _httpRequest: function (url, body, method, callback) {
    request({
      url: url,
      body: body,
      method: this.http_method,
      timeout: this.timeout,
      rejectUnauthorized: false,
      auth: this.auth
    },
    function (error, response, body) {
      callback(error, response, body)
    })
  },

  setTargetDoorState: function (value, callback) {
    var url = this.apiroute + '/setTargetDoorState/' + value
    this.log('[+] Setting targetDoorState: %s', url)
    this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
      if (error) {
        this.log.warn('[!] Error setting targetDoorState: %s', error.message)
        callback(error)
      } else {
        this.log('[*] Successfully set targetDoorState to: %s', value)
        if (value === 0 && this.autoLock) {
          this.autoLockFunction()
        }
        callback()
      }
    }.bind(this))
  },

  autoLockFunction: function () {
    this.log('[+] Waiting %s seconds for autolock', this.autoLockDelay)
    setTimeout(() => {
      this.service.setCharacteristic(Characteristic.TargetDoorState, 1)
      this.log('[*] Autolocking...')
    }, this.autoLockDelay * 1000)
  },

  getServices: function () {
    this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(1)
    this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(1)
    this.service.getCharacteristic(Characteristic.ObstructionDetected).updateValue(0)

    this.informationService = new Service.AccessoryInformation()
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmware)

    this.service
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('set', this.setTargetDoorState.bind(this))

    return [this.informationService, this.service]
  }
}
