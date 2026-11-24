/*
 * ONE-OFF MIGRATION: moves old posts' and stories' photos from the "uploads" folder into MongoDB (GridFS).
 *
 * Before this change, a photo was saved as a file in the uploads folder, and its post or story pointed at it with
 * image: "/uploads/<name>". Now photos live in GridFS and the post or story stores imageId. Anything still using the old
 * "/uploads/..." address can't be shown any more, so run this once to bring the old ones across:
 *
 *      node migrate-uploads-to-gridfs.js            shows what WOULD happen (changes nothing)
 *      node migrate-uploads-to-gridfs.js --apply    really does it
 *
 * For each old post or story:
 *   - a JPEG, PNG or WebP photo whose file is still in the uploads folder is copied into GridFS, and the post or story gets its
 *     imageId (the old "image" and "mediaType" fields are removed);
 *   - anything else (a video, a GIF, an animated picture, or a file that is missing) can no longer be shown, so that post or
 *     story is deleted, along with its comments, likes, saves and notifications.
 * The files in the uploads folder are never touched. When it has run you can delete the folder yourself.
 * Photos over 2 MB are still migrated (the 2 MB limit is for new uploads), but they are listed so you can decide.
 *
 * It needs the same .env as the server (MONGODB_URI and DB_NAME).
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient, ServerApiVersion, GridFSBucket } = require('mongodb');

const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Same checks as the server: what the file really is, from its first bytes
function detectPhotoType(buffer) {
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
    if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
    if (buffer.length > 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    return null;
}

function isAnimatedPhoto(buffer, type) {
    if (type === 'webp') return buffer.subarray(12, 16).toString('ascii') === 'VP8X' && buffer.length > 20 && (buffer[20] & 0x02) !== 0;
    if (type === 'png') {
        const control = buffer.indexOf('acTL');
        const data = buffer.indexOf('IDAT');
        return control !== -1 && (data === -1 || control < data);
    }
    return false;
}

function savePhoto(bucket, buffer, type) {
    return new Promise((resolve, reject) => {
        const stream = bucket.openUploadStream(`photo.${type}`, { metadata: { contentType: PHOTO_TYPES[type] } });
        stream.on('error', reject);
        stream.on('finish', () => resolve(stream.id));
        stream.end(buffer);
    });
}

// Does the work. db is a MongoDB database, makeBucket() gives the GridFS bucket, apply = really change things.
async function migrate({ db, makeBucket, uploadDir, apply, log = console.log }) {
    const summary = { migrated: 0, deleted: 0, large: 0 };

    for (const [name, label] of [['posts', 'post'], ['stories', 'story']]) {
        const all = await db.collection(name).find({}).toArray();
        const old = all.filter(doc => !doc.imageId && typeof doc.image === 'string' && doc.image.startsWith('/uploads/'));
        log(`\n${name}: ${old.length} using the old uploads folder`);

        for (const doc of old) {
            const file = path.join(uploadDir, path.basename(doc.image));
            let buffer = null;
            try { buffer = await fs.promises.readFile(file); } catch (error) { /* missing file */ }

            const type = buffer ? detectPhotoType(buffer) : null;
            let reason = null;
            if (!buffer) reason = 'its file is missing';
            else if (!type) reason = 'it is a video, a GIF or another unsupported file';
            else if (isAnimatedPhoto(buffer, type)) reason = 'it is an animated picture';

            if (reason) {
                log(`  DELETE ${label} ${doc._id} (${doc.image}): ${reason}`);
                if (apply) {
                    if (name === 'posts') {
                        for (const related of ['comments', 'likes', 'saves', 'notifications']) await db.collection(related).deleteMany({ postId: doc._id });
                    } else {
                        await db.collection('storyViews').deleteMany({ storyId: doc._id });
                    }
                    await db.collection(name).deleteOne({ _id: doc._id });
                }
                summary.deleted++;
                continue;
            }

            const mb = (buffer.length / 1048576).toFixed(2);
            if (buffer.length > 2 * 1048576) summary.large++;
            log(`  MIGRATE ${label} ${doc._id} (${doc.image}, ${type}, ${mb} MB${buffer.length > 2 * 1048576 ? ', over the 2 MB limit for new uploads' : ''})`);
            if (apply) {
                const imageId = await savePhoto(makeBucket(), buffer, type);
                await db.collection(name).updateOne({ _id: doc._id }, { $set: { imageId }, $unset: { image: '', mediaType: '' } });
            }
            summary.migrated++;
        }
    }

    log(`\n${apply ? 'Done' : 'Dry run (nothing was changed)'}: ${summary.migrated} to migrate, ${summary.deleted} to delete, ${summary.large} over 2 MB.`);
    if (!apply && summary.migrated + summary.deleted > 0) log('Run it again with --apply to do this for real.');
    return summary;
}

module.exports = { migrate };

if (require.main === module) {
    (async () => {
        const client = new MongoClient(process.env.MONGODB_URI, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });
        try {
            await client.connect();
            const db = client.db(process.env.DB_NAME || 'musclemates');
            await migrate({
                db,
                makeBucket: () => new GridFSBucket(db, { bucketName: 'photos' }),
                uploadDir: path.join(__dirname, 'uploads'),
                apply: process.argv.includes('--apply')
            });
        } catch (error) {
            console.error('Migration failed:', error.message);
            process.exitCode = 1;
        } finally {
            await client.close();
        }
    })();
}
