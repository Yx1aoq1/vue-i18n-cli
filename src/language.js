import fs from 'fs'
import path from 'path'
import { 
  getFilenameWithoutExt,
  getExtname,
  flatten,
  unflatten,
  getRandomStr
} from './utils/common'
import { readESModuleFile, exportFile } from './utils/fs'
import translateHTML from './translateHTML'
import translateJS from './translateJS'
import * as vueCompiler from 'vue-template-compiler'
import Stringify from 'vue-sfc-descriptor-stringify'
import cloneDeep from 'lodash.clonedeep'

function handleVueCode (code, languageUtils, exportName) {
  const originSfcDescriptor = vueCompiler.parseComponent(code)
  const sfcDescriptor = cloneDeep(originSfcDescriptor)
  sfcDescriptor.template.content = handleTemplateCode(sfcDescriptor.template.content, languageUtils, exportName)
  sfcDescriptor.script.content = handleJavaScriptCode(sfcDescriptor.script.content, languageUtils, exportName)
  
  return Stringify(sfcDescriptor, originSfcDescriptor)
}

function handleTemplateCode (code, languageUtils, exportName) {
  // 该文件代码是否忽略国际化
  if (isIgnore(code)) {
    return code
  }
  return translateHTML(code, languageUtils, exportName)
}

function handleJavaScriptCode (code, languageUtils, exportName, isVue) {
  // 该文件代码是否忽略国际化
  if (isIgnore(code)) {
    return code
  }
  return translateJS(code, languageUtils, exportName, isVue)
}

/**
 * 如果代码中包含 i18nIgnore 关键字，则该文件忽略国际化
 * @param {*} code
 */
function isIgnore(code) {
  return code.includes('i18nIgnore')
}

export default class LanguageUtils {
  constructor (lang) {
    this.cfg = USER_CONFIG
    this.langPath = path.resolve(process.cwd(), this.cfg.languagePath, lang)
    this.map = this.createMap()
  }

  createMap () {
    const i18nMap = new Map()
    fs.readdirSync(this.langPath)
      .filter(filename => filename !== 'index.js' && filename.indexOf('.js') > -1)
      .forEach(filename => {
        const name = getFilenameWithoutExt(filename)
        const filepath = path.resolve(this.langPath, filename)
        const flatI18n = flatten(readESModuleFile(filepath))
        i18nMap.set(name, flatI18n)
      })
    return i18nMap
  }

  findKey (name, text) {
    for (const [key, value] of this.map.entries()) {
      for (const subKey of Object.keys(value)) {
        if (value[subKey] === text) {
          return `${key}.${subKey}`
        }
      }
    }
    const newKey = `trans_${getRandomStr()}`
    this.updateKey(name, newKey, text)
    return `${name}.${newKey}`
  }

  updateKey (name, key, value) {
    const i18n = this.map.get(name) || {}
    i18n[key] = value
    this.map.set(name, i18n)
  }

  stringToIdentifier (name, text) {
    const variable = /\$?\{?\{([a-zA-Z][a-zA-Z\d\.]*)\}?\}/g
    const variableMatch = variable.exec(text)
    const vname = variableMatch && variableMatch[1]
    let param, key
    if (vname && vname.includes('.')) {
      param = `{ value: ${vname} }`
      key = this.findKey(name, text.replace(variable, 'value'))
    } else {
      param = `{ ${name} }`
      key = this.findKey(name, text.replace(variable, '{$1}'))
    }
    return !!variableMatch ? `$t('${key}', ${param})` : `$t('${key}')`
  }

  getLocale (name, filepath, type = 'js') {
    let content = unflatten(this.map.get(name)) || {}
    if (!filepath) {
      filepath = path.resolve(this.langPath, name)
    }
    switch (type) {
      case 'json':
        return exportFile(filepath + '.json', JSON.stringify(content, null, 2), { flag: 'w' })
      case 'js':
        content = `export default ${JSON.stringify(content, null, 2)}`
        content = content.replace(/\"([\w_-]*)\":\s*\"(.*)\"/g, '$1: \'$2\'')
        return exportFile(filepath + '.js', content, { flag: 'w' })
    }
  }

  translate (filepath, name, replace = false) {
    const extname = getExtname(filepath)
    const code = fs.readFileSync(filepath, 'utf-8')
    let newCode
    switch (extname) {
      case 'vue':
        newCode = handleVueCode(code, this, name)
        break
      case 'js':
        newCode = handleJavaScriptCode(code, this, name, false)
        break
      default:
        return
    }
    replace && exportFile(filepath, newCode, { flag: 'w' })
  }
}