/**
 *  Re-implementation of readtags.c in nodejs
 */

const minimatch = require('minimatch')
const path = require('path')
const Promise = require('bluebird')

const fs = Promise.promisifyAll(require('fs'))

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
 *  @return An object, containing the opened tag file's file descriptor
 *          and the path to the file, e.g. {fd: 4, path: '/my/.tags'}.
 *          The caller should close the returned file descriptor.
 */
function findCTagsFile(searchPath, tagFilePattern) {
    const ctagsFinder = function ctagsFinder(tagPath) {
        console.log(`Searching ${tagPath}`)
        return fs.readdirAsync(tagPath).then(files => {
            const newTagPath = path.dirname(tagPath)
            const matched = files.filter(minimatch.filter(tagFilePattern)).sort()
            const ret = !matched ? Promise.resolve(null) :
            Promise.reduce(matched, (acc, match) => {
                if (acc) {
                    return acc
                }
                const matchPath = path.join(tagPath, match)
                return fs.openAsync(matchPath, 'r').then(fd => ({ fd, path: matchPath }))
                .catch(() => null) // EAFP
            }, null)

            return ret.then(result => {
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

/*
class CTags {
    constructor() {
    }
    destroy() {
    }
}
*/

module.exports = { findCTagsFile }
