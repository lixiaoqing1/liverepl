#!/usr/bin/env node --experimental-repl-await --trace-deprecation
const repl = require('repl');
const gaze = require('gaze');
const Module = require('module');
const originalRequire = Module.prototype.require;
const fs = require('fs');
const path = require('path');
const cwd = process.cwd();

let config = {
    ignores: [],
    constants: {},
    installs: {},
};

try {
    config = require(`${cwd}/liverepl.config`);
} catch (err) {
}

config.ignores = config.ignores || [];
config.constants = config.constants || [];
config.installs = config.installs || {};

//https://github.com/gulpjs/gulp/issues/2460
{
    const {emitWarning} = process;
    process.emitWarning =
        (warning, type, code, ...extraArgs) =>
            code !== 'DEP0097' && emitWarning(warning, type, code, ...extraArgs);
}

let autoreload_objs = {};

const context = repl.start({
    input: process.stdin,
    output: process.stdout,
    prompt: 'liverepl> ',
}).context;

const modules = [];

let watchPattern = {};

function getFileAbsolutePath(file) {
    let res = file;
    if (file.indexOf('./') === 0) {
        res = path.join(cwd, file);
    }
    return res;
}

function invalidateCache(file) {
    // 忽略一些不能被重新加载的文件
    delete require.cache[require.resolve(getFileAbsolutePath(file))];
}

function reloadModule(ctx, key, file) {
    invalidateCache(file);
    ctx[key] = require(file);
}

function reloadModules(ctx, moduleList) {
    Object.keys(moduleList).forEach((module) => {
        reloadModule(ctx, module, modules[module]);
    });
}

let fileWatcher;

function watchForChanges(ctx) {
    fileWatcher = gaze([], {mode: 'poll'}, (err, watcher) => {
        watcher.on('all', (event, filepath) => {
            let needIgnore = false;
            config.ignores.forEach((ignore) => {
                if (filepath.indexOf(path.join(cwd, ignore)) === 0) {
                    needIgnore = true;
                }
            });

            if (needIgnore) return;

            //首先删除被改动文件直接对应的require.cache条目
            invalidateCache(filepath);
            //重新计算context上下文中的keys对应module的path
            refreshModules();
            //重新加载context上下文中依赖的所有module
            reloadModules(ctx, modules);
        });
    });
}

const filterKeys = [
    'global',
    'console',
    'DTRACE_NET_SERVER_CONNECTION',
    'DTRACE_NET_STREAM_END',
    'DTRACE_HTTP_SERVER_REQUEST',
    'DTRACE_HTTP_SERVER_RESPONSE',
    'DTRACE_HTTP_CLIENT_REQUEST',
    'DTRACE_HTTP_CLIENT_RESPONSE',
    'process',
    'Buffer',
    'clearImmediate',
    'clearInterval',
    'clearTimeout',
    'setImmediate',
    'setInterval',
    'setTimeout',
    '__core-js_shared__',
    'core',
    'System',
    'asap',
    'Observable',
    'regeneratorRuntime',
    '_babelPolyfill',
    'module',
    'require',
    'autoreload_objs',
];

function refreshModules() {
    let keys = Object.keys(context);
    for (let index in keys) {
        let keyName = keys[index];
        if (filterKeys.indexOf(keyName) >= 0) {
            continue;
        }

        let path = findModulePath(context[keyName]);

        if (path && modules[keyName] !== path) {
            modules[keyName] = path;
        }
    }

    autoreload_objs = {};
}

function findModulePath(m) {
    for (let i in autoreload_objs) {
        if (m === autoreload_objs[i]) {
            return i;
        }
    }
}

let lastTimer;
const _require = function () {
    const filename = this.filename;
    try {
        let requiredFileName = arguments[0];
        if (filename && filename.indexOf(cwd) !== 0) {
            requiredFileName = getFileAbsolutePath(arguments[0]);
            arguments[0] = requiredFileName;
        }

        let m = originalRequire.apply(this, arguments);
        if (filename == null) {
            autoreload_objs[requiredFileName] = m;
        } else {
            const dir = path.dirname(filename);
            if (filename.indexOf(cwd + '/node_modules/') == 0) return m;

            if (requiredFileName.indexOf('/') == 0) {
                autoreload_objs[requiredFileName] = m;
            } else {
                const finalPath = path.join(dir, requiredFileName);
                autoreload_objs[finalPath] = m;
            }
        }

        clearTimeout(lastTimer);
        lastTimer = setTimeout(refreshWatchFiles, 1000);
        return m;
    } catch (err) {
        if (filename && filename.indexOf(cwd + '/node_modules/') == 0) {
            throw err;
        }

        console.error(err);
    }
};

Module.prototype.require = _require;

function getAddFiles() {
    let allCachedFiles = Object.keys(require.cache);
    let newFiles = [];
    for (let i in allCachedFiles) {
        let filepath = allCachedFiles[i];
        if (filepath.indexOf(cwd + '/node_modules/') === 0) continue;

        if (!watchPattern[filepath]) {
            watchPattern[filepath] = true;
            newFiles = newFiles.concat([filepath]);
        }
    }

    return newFiles;
}

function refreshWatchFiles() {
    fileWatcher.add(getAddFiles());
}

reloadModules(context, modules);
watchForChanges(context);

try {
    const constants = config.constants;
    Object.keys(constants).map((key) => {
        context[key] = constants[key];
    });
    const installs = config.installs;
    Object.keys(installs).forEach((key) => {
        const installItem = installs[key];
        const stat = fs.lstatSync(installItem);

        if (stat.isDirectory()) {
            const moduleFiles = fs.readdirSync(installItem);
            moduleFiles.forEach((moduleFile) => {
                if (moduleFile.indexOf('.js') === -1) return;

                moduleFile = moduleFile.replace('.js', '');

                let name = moduleFile.replace(/_/g, '');

                context[`${key}${name}`] = _require(
                    `${installItem}/${moduleFile}`,
                );
            });
        } else {
            if (installItem.indexOf('.js') === -1) return;

            let moduleFile = path.basename(installItem);
            moduleFile = moduleFile.replace('.js', '');

            let name = moduleFile.replace(/_/g, '');

            context[`${key}${name}`] = _require(
                `${installItem}`,
            );
        }
    });
} catch (err) {
    console.error(err);
}
