import fs from 'fs'
import path from 'path'
import readline from 'readline'
import getConfig from '../utils/config'
import { getExtname, getRandomStr } from '../utils/common'

const CHINESE_REG = /[^\x00-\xff]+[^\<\>\"\'\`]*/g
const VARIABLE_REG = /\$?\{?\{([a-zA-Z][a-zA-Z\d]*)\}?\}/g
const CONSOLE_REG = /console\.log\(.*\)/g
/**
 * 遍历文件夹
 */
function travelDir (src, ignore, callback) {
  fs.readdirSync(src).forEach(filename => {
    // 忽略
    if (isIgnore(ignore, filename)) return
    // 判断是否为文件夹
    const filepath = path.join(src, filename)
    if (isDirectory(filepath)) {
      travelDir(filepath, ignore, callback)
    } else {
      callback(filepath)
    }
  })
}

function isIgnore (ignore, filename) {
  return ignore.includes(filename)
}

function isDirectory (filepath) {
  return fs.statSync(filepath).isDirectory()
}

function handleCode (filepath) {
  const zhs = []
  return new Promise ((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filepath)
    })
    let isNote = false
    rl.on('line', line => {
      let content = isNote ? '' : line.replace(CONSOLE_REG, '')
      if (line.includes('/*')) {
        isNote = true
        content = line.slice(0, line.indexOf('/*'))
      }
      if (line.includes('*/')) {
        if (isNote) {
          isNote = false
          content = line.slice(line.indexOf('*/') + 2)
        }
      }
      if (line.includes('<!--')) {
        isNote = true
        content = line.slice(0, line.indexOf('<!--'))
      }
      if (line.includes('-->')) {
        if (isNote) {
          isNote = false
          content = line.slice(line.indexOf('-->') + 3)
        }
      }
      if (isNote && !content) return
      if (line.includes('//')) content = line.slice(0, line.indexOf('//'))
      const matchs = content.match(CHINESE_REG)
      while (matchs && matchs.length) {
        const str = matchs.pop().replace(VARIABLE_REG, '{$1}')
        if (!zhs.includes(str)) {
          zhs.push(str)
        }
      }
    })
    rl.on('close', () => {
      resolve(zhs)
    })
  })
}

export default function getlang (program) {
  program
    .command('getlang <src>')
    .description('对<src>目录下的.vue .js 文件进行中文收集')
    .option('-d, --dir <exportDir>', '输出文件位置')
    .option('-f, --filename <filename>', '输出文件名称')
    .option('-i, --ignore <dir>', '需要忽略的文件或文件夹', value => {
      return value.split(',')
    })
    .action(async (src, { dir = '.', filename = 'zh', ignore = [] }) => {
      getConfig()
      const fileList = []
      travelDir(src, ignore, (filepath) => {
        const extname = getExtname(filepath)
        if (['vue', 'js'].includes(extname)) {
          fileList.push(filepath)
        }
      })
      const lang = {}
      for (const filepath of fileList) {
        const zhs = await handleCode(filepath)
        lang[filepath] = zhs.reduce((res, cur, idx) => {
          res[getRandomStr()] = cur
          return res
        }, {})
      }
      console.log(lang)
      const transPath = path.join(process.cwd(), `${dir}/${filename}.json`)
      fs.writeFileSync(transPath, JSON.stringify(lang, null, 2), { flag: 'w' })
    })
}