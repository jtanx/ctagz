/**
 *  Re-implementation of readtags.c in nodejs
 */

const minimatch = require('minimatch')
const path = require('path')
const Promise = require('bluebird')
const StringDecoder = require('string_decoder').StringDecoder
// StringDecoder lastTotal contains number of bytes remaining in buffer

const fs = Promise.promisifyAll(require('fs'))

class CTags {
    constructor(tagsFile, fd) {
        this.tagsFile = tagsFile
        this.fd = fd
        this.pos = 0
        this.workingPos = 0
        this.readBuffer = Buffer.allocUnsafe(1024)
        this.decoder = new StringDecoder()
        this.lines = []
    }

    _skipPartialUTF8(buffer, length) {
        let offset = 0
        while (offset < length && (buffer[offset] & 0xC0) === 0x80) {
            offset += 1
        }
        if (offset > 0) {
            return buffer.slice(offset)
        }
        return buffer
    }

    _readTagLine() {
        const readAtLeastALine = function readAtLeastALine(ctags) {
            while (ctags.lines.length > 1) {
                const line = ctags.lines.shift()
                if (line) {
                    return Promise.resolve(line)
                }
            }
            if (ctags.workingPos < ctags.size) {
                return fs.readAsync(ctags.fd, ctags.readBuffer, 0, ctags.readBuffer.length, ctags.workingPos)
                .then(bytesRead => {
                    ctags.workingPos += bytesRead
                    let readBuffer = ctags.readBuffer
                    if (ctags.decoder.lastTotal === 0) { // hurr internal property
                        readBuffer = ctags._skipPartialUTF8(readBuffer, bytesRead)
                    }

                    const parts = ctags.decoder.write(readBuffer).split(/\r?\n/)
                    // console.log(`Got ${parts.length} parts`)
                    if (ctags.lines.length > 0) {
                        ctags.lines[ctags.lines.length - 1] += parts[0]
                        ctags.lines = ctags.lines.concat(parts.slice(1))
                    } else {
                        ctags.lines = parts
                    }

                    return readAtLeastALine(ctags)
                })
            } else if (ctags.lines.length > 0) {
                // Last line of file... probably
                return Promise.resolve(ctags.lines.shift())
            }
            return Promise.resolve(null)
        }

        return readAtLeastALine(this)
    }

    _readTagLineSeek(pos) {
        this.pos = this.workingPos = Math.min(Math.max(pos, 0), this.size)
        this.decoder.end()
        this.lines = []

        this._readTagLine()
        return this._readTagLine()
    }

    init() {
        let state
        if (!this.fd) {
            state = fs.openAsync(this.tagsFile).then(fd => {
                this.fd = fd
                return fs.fstatAsync(this.fd)
            })
        } else {
            state = fs.fstatAsync(this.fd)
        }

        return state.then(stats => {
            this.size = stats.size
            return this
        })
    }

    destroy() {
        if (this.fd) {
            return fs.closeAsync(this.fd).then(() => {
                this.fd = 0
            })
        }
        return Promise.resolve()
    }
}

/**
 *  Finds the CTags file from the specified search path and pattern
 *  @param [in] searchPath The path to search. This may either be a
 *                         file or directory. If a file is passed,
 *                         its directory is searched. If the tag file
 *                         is not found, its parent directories are
 *                         then searched.
 *  @param [in] tagFilePattern The search pattern to use when searching
 *                             for the tag file. This pattern can be
 *                             anything that the minimatch package
 *                             supports. However, if more than one file
 *                             matches, the results are sorted, and only
 *                             the first file is used as the tag file.
 *  @return An new CTags instance.
 *          The caller call destroy() when finished with it.
 */
function findCTagsFile(searchPath, tagFilePattern = '{.,}tags') {
    const ctagsFinder = function ctagsFinder(tagPath) {
        console.log(`Searching ${tagPath}`)
        return fs.readdirAsync(tagPath).then(files => {
            const matched = files.filter(minimatch.filter(tagFilePattern)).sort()
            const ret = !matched ? Promise.resolve(null) :
            Promise.reduce(matched, (acc, match) => {
                if (acc) {
                    return acc
                }
                const matchPath = path.join(tagPath, match)
                return fs.openAsync(matchPath, 'r').then(fd => new CTags(matchPath, fd))
                .catch(() => {}) // EAFP
            }, null)

            return ret.then(result => {
                const newTagPath = path.dirname(tagPath)
                if (!result && newTagPath !== tagPath) {
                    return ctagsFinder(newTagPath)
                }
                return result
            })
        })
    }

    let tagPath = path.resolve(searchPath)
    return fs.statAsync(tagPath).then(stats => {
        if (stats.isFile()) {
            tagPath = path.dirname(tagPath)
        }
        return ctagsFinder(tagPath)
    })
}


module.exports = { CTags, findCTagsFile }
