import fg from 'fast-glob'
import path from 'path'
import { uniq, set, find } from 'lodash'
import { Global } from './global'
import { flatten, unflatten } from './utils/flat'
import { getRandomStr } from './utils/common'

export class LocaleLoader {
	constructor (rootpath) {
		this.rootpath = rootpath
	}

	async init () {
		if (await this.findLocaleDirs()) {
			this._pathMatchers = Global.getPathMatchers()
			await this.loadAll()
		}
		this.updateLocalesData()
	}

	async findLocaleDirs () {
		this._files = {}
		this._localeDirs = []
		const localesPaths = Global.localesPaths
		if (localesPaths && localesPaths.length) {
			try {
				const _localeDirs = await fg(localesPaths, {
					cwd: this.rootpath,
					onlyDirectories: true
				})
				if (localesPaths.includes('.')) _localeDirs.push('.')
				this._localeDirs = uniq(_localeDirs.map(p => path.resolve(this.rootpath, p)))
			} catch (e) {
				logger.error(e)
			}
		}

		if (this._localeDirs.length === 0) {
			logger.info('\n⚠ No locales paths.')
			return false
		}

		return true
	}

	async loadAll () {
		for (const pathname of this._localeDirs) {
			await this.loadDirectory(pathname)
		}
	}

	async loadDirectory (searchingPath) {
		const files = await fg('**/*.*', {
			cwd: searchingPath,
			onlyFiles: true,
			ignore: [ 'node_modules/**', 'vendors/**', ...Global.ignoreFiles ],
			deep: Global.includeSubfolders ? undefined : 2
		})
		for (const relative of files) {
			await this.loadFile(searchingPath, relative)
		}
	}

	async loadFile (dirpath, relativePath) {
		try {
			const result = this.getFileInfo(dirpath, relativePath)
			if (!result) return
			const { locale, parser, namespace, fullpath: filepath, matcher } = result
			if (!parser) return
			if (!locale) return
			if (namespace === 'index') return
			let data = await parser.load(filepath)
			const value = flatten(data)
			this._files[filepath] = {
				filepath,
				dirpath,
				locale,
				value,
				namespace,
				matcher
			}
		} catch (e) {
			logger.error(e)
		}
	}

	getFileInfo (dirpath, relativePath) {
		const fullpath = path.resolve(dirpath, relativePath)
		const ext = path.extname(relativePath)

		let match = null
		let matcher

		for (const r of this._pathMatchers) {
			match = r.regex.exec(relativePath)
			if (match && match.length > 0) {
				matcher = r.matcher
				break
			}
		}

		if (!match || match.length < 1) return

		let namespace = match.groups && match.groups.namespace
		if (namespace) namespace = namespace.replace(/\//g, '.')

		let locale = match.groups && match.groups.locale
		if (!locale) {
			locale = Global.sourceLanguage
		}
		if (!locale) return

		const parser = Global.getMatchedParser(ext)

		return {
			locale,
			parser,
			ext,
			namespace,
			fullpath,
			matcher
		}
	}

	updateLocalesData () {
		this._flattenLocaleData = {}
		this.files = Object.values(this._files)
		if (Global.namespace) {
			const namespaces = uniq(this.files.map(f => f.namespace))
			for (const ns of namespaces) {
				const files = this.files.filter(f => f.namespace === ns)

				for (const file of files) {
					const value = ns ? set({}, ns, file.value) : file.value
					this.update(value, file)
				}
			}
		} else {
			for (const file of this.files) {
				this.update(value, file)
			}
		}
	}

	update (data, options) {
		const { namespace, locale } = options
		set(this._flattenLocaleData, locale, data)
	}

	findMatchLocaleKey (text, namespace) {
		const locale = Global.sourceLanguage
		const localeDatas = flatten(this._flattenLocaleData[locale])
		for (const key in localeDatas) {
			const value = localeDatas[key]
			if (text === value) {
				return key
			}
		}
		const newKey = this.generateLocaleKey(text)
		const localeKey = namespace ? `${namespace}.${newKey}` : `${locale}.${newKey}`
		set(this._flattenLocaleData, localeKey, text)
		return localeKey
	}

	generateLocaleKey (text) {
		if (Global.generateLocaleKey && typeof Global.generateLocaleKey === 'function') {
			return Global.generateLocaleKey.call(this, text)
		}
		// TODO: 对接一个翻译API
		if (Global.generateLocaleKey === 'translate') {
		}
		// 生成一个随机 key
		return `trans_${getRandomStr()}`
	}
}
