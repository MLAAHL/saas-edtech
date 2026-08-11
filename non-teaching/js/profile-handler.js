/**
 * Profile Handler for Non-Teaching Staff
 * Manages profile image uploads to Cloudinary and database updates.
 */

const ProfileHandler = {
    cloudinaryConfig: null,
    isUploading: false,

    /**
     * Fetch Cloudinary configuration from the backend
     */
    async fetchConfig() {
        if (this.cloudinaryConfig) return this.cloudinaryConfig;

        try {
            const headers = {};
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                headers['Authorization'] = `Bearer ${token}`;
            }
            const response = await fetch(`${window.APP_CONFIG.API_BASE_URL}/config/cloudinary`, { headers });
            const data = await response.json();
            if (data.success && data.config) {
                this.cloudinaryConfig = data.config;
                return this.cloudinaryConfig;
            }
            throw new Error('Could not load upload configuration');
        } catch (error) {
            console.error('❌ Cloudinary Config Error:', error);
            return null;
        }
    },

    /**
     * Main upload function
     */
    async uploadImage(file, email) {
        if (this.isUploading) return;

        try {
            this.isUploading = true;
            this.updateUIStatus(true);

            const config = await this.fetchConfig();
            if (!config) throw new Error('Upload service unavailable');

            // 1. Upload to Cloudinary
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', config.uploadPreset);
            formData.append('folder', 'teacher-profiles');

            const publicId = `teacher_${email.replace(/[@. ]/g, '_')}_${Date.now()}`;
            formData.append('public_id', publicId);

            const cloudRes = await fetch(
                `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
                { method: 'POST', body: formData }
            );

            if (!cloudRes.ok) throw new Error('Failed to upload image to cloud');
            const cloudData = await cloudRes.json();
            const imageUrl = cloudData.secure_url;

            // 2. Update Backend
            const headers = { 'Content-Type': 'application/json' };
            if (window.firebaseAuth && window.firebaseAuth.currentUser) {
                const token = await window.firebaseAuth.currentUser.getIdToken();
                headers['Authorization'] = `Bearer ${token}`;
            }
            const backendRes = await fetch(`${window.APP_CONFIG.API_BASE_URL}/teacher/profile/${encodeURIComponent(email)}/image`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ profileImageUrl: imageUrl })
            });

            const backendData = await backendRes.json();
            if (!backendData.success) throw new Error(backendData.error || 'Failed to save profile');

            // Caller reports the outcome; this just refreshes what is on screen.
            this.refreshAvatars(imageUrl);

        } catch (error) {
            console.error('❌ Upload Error:', error);
            throw error;
        } finally {
            this.isUploading = false;
            this.updateUIStatus(false);
        }
    },

    /**
     * Update UI to reflect uploading state
     */
    updateUIStatus(isLoading) {
        const avatar = document.getElementById('headerAvatar');
        if (!avatar) return;

        if (isLoading) {
            avatar.dataset.oldContent = avatar.innerHTML;
            avatar.innerHTML = `<span class="material-symbols-rounded" style="font-size: 16px; animation: spin 1s linear infinite;">sync</span>`;
            avatar.style.opacity = '0.7';
        } else {
            avatar.style.opacity = '1';
        }
    },

    /**
     * Refresh all user avatars on the current page
     */
    refreshAvatars(url) {
        const avatars = document.querySelectorAll('#headerAvatar, .sb-profile-dot, .user-avatar');
        avatars.forEach(av => {
            av.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        });
    },

    /**
     * Helper for notifications (standalone)
     */
    showNotification(msg, type = 'success') {
        // Use existing if available
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type);
            return;
        }

        // Create notification element
        const id = 'profile-toast-' + Date.now();
        const toast = document.createElement('div');
        toast.id = id;
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: ${type === 'success' ? '#10B981' : '#EF4444'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            font-family: sans-serif;
            font-size: 14px;
            font-weight: 600;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);

        // Show
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);

        // Hide
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

/**
 * Save a new display name.
 */
ProfileHandler.saveName = async function (name, email) {
    const headers = { 'Content-Type': 'application/json' };
    if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        const token = await window.firebaseAuth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-uid'] = window.firebaseAuth.currentUser.uid;
    }
    const res = await fetch(
        `${window.APP_CONFIG.API_BASE_URL}/teacher/profile/${encodeURIComponent(email)}/name`,
        {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                name,
                firebaseUid: window.firebaseAuth?.currentUser?.uid || undefined
            })
        }
    );
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Could not save the name');

    // Every place the name is shown on this page.
    document.querySelectorAll('#headerUserFullName, #headerUserName, .sb-profile-name')
        .forEach(el => { el.textContent = name; });
    return data;
};

/**
 * The edit dialog.
 *
 * Built here rather than written into all ten pages, so there is one copy of
 * the markup and no chance of the pages drifting apart.
 */
function buildProfileDialog() {
    if (document.getElementById('profileEditOverlay')) return;

    const wrap = document.createElement('div');
    wrap.id = 'profileEditOverlay';
    wrap.className = 'pf-overlay';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="pf-card" role="dialog" aria-modal="true" aria-labelledby="pfHeading">
        <h2 id="pfHeading">Your profile</h2>

        <div class="pf-photo-row">
          <div class="pf-photo" id="pfPhoto"></div>
          <div>
            <button type="button" class="pf-btn pf-btn-ghost" id="pfPick">Change photo</button>
            <div class="pf-hint">JPG or PNG, up to 5&nbsp;MB.</div>
          </div>
        </div>

        <label class="pf-label" for="pfName">Display name</label>
        <input type="text" id="pfName" maxlength="60" autocomplete="off">
        <div class="pf-hint" id="pfEmail"></div>

        <div class="pf-actions">
          <button type="button" class="pf-btn pf-btn-ghost" id="pfCancel">Cancel</button>
          <button type="button" class="pf-btn pf-btn-primary" id="pfSave">Save</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const style = document.createElement('style');
    style.textContent = `
      .pf-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,.6);
        backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
      .pf-overlay[hidden] { display: none; }
      .pf-card { background: var(--bg-card, #1A1A1D); border: 1px solid var(--border-hover, rgba(255,255,255,.09));
        border-radius: 16px; padding: 24px; width: 100%; max-width: 380px;
        box-shadow: 0 24px 60px -12px rgba(0,0,0,.7); font-family: inherit; }
      .pf-card h2 { font-size: 17px; font-weight: 700; margin: 0 0 18px; color: var(--text-primary, #E8E8EC); }
      .pf-photo-row { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
      .pf-photo { width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
        background: var(--purple-dim, rgba(167,139,250,.12)); color: var(--purple, #A78BFA);
        display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700; }
      .pf-photo img { width: 100%; height: 100%; object-fit: cover; }
      .pf-label { display: block; font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .05em; color: var(--text-muted, #4E4E56); margin-bottom: 6px; }
      #pfName { width: 100%; padding: 10px 12px; border-radius: 8px; font-size: 13px; font-family: inherit;
        border: 1px solid var(--border, rgba(255,255,255,.05)); background: var(--bg-elevated, #242427);
        color: var(--text-primary, #E8E8EC); outline: none; margin-bottom: 6px; }
      #pfName:focus { border-color: var(--purple, #A78BFA); }
      .pf-hint { font-size: 11px; color: var(--text-muted, #4E4E56); margin-top: 5px; line-height: 1.4; }
      .pf-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
      .pf-btn { padding: 9px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
        font-family: inherit; cursor: pointer; border: none; }
      .pf-btn-primary { background: var(--purple, #A78BFA); color: #12121A; }
      .pf-btn-primary:disabled { opacity: .5; cursor: default; }
      .pf-btn-ghost { background: var(--bg-elevated, #242427); color: var(--text-secondary, #8A8A92);
        border: 1px solid var(--border, rgba(255,255,255,.05)); }
      .sb-profile { cursor: pointer; transition: background .15s; }
      .sb-profile:hover { background: rgba(255,255,255,.04); }`;
    document.head.appendChild(style);
}

// Initialize the profile editor
function initProfileUpload(userEmail) {
    if (!userEmail) return;

    buildProfileDialog();

    let fileInput = document.getElementById('profileImageInput');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'profileImageInput';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }

    const overlay = document.getElementById('profileEditOverlay');
    const el = (id) => document.getElementById(id);
    let chosenFile = null;

    function currentName() {
        const n = document.querySelector('#headerUserFullName, #headerUserName, .sb-profile-name');
        return (n && n.textContent.trim()) || '';
    }

    function open() {
        chosenFile = null;
        el('pfName').value = currentName();
        el('pfEmail').textContent = userEmail;
        // Show whatever the sidebar is showing, photo or initials.
        const dot = el('headerAvatar');
        el('pfPhoto').innerHTML = dot ? dot.innerHTML : '';
        overlay.hidden = false;
        setTimeout(() => el('pfName').focus(), 30);
    }

    function close() { overlay.hidden = true; }

    // The whole chip opens the editor.
    const chip = document.querySelector('.sb-profile');
    if (chip) {
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('title', 'Edit your name and photo');
        chip.addEventListener('click', open);
        chip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
    }

    el('pfCancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) close();
    });

    el('pfPick').addEventListener('click', () => fileInput.click());

    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            ProfileHandler.showNotification('Image too large. Max 5MB.', 'error');
            return;
        }
        chosenFile = file;
        // Shown straight away, so the choice is visible before saving.
        const reader = new FileReader();
        reader.onload = (ev) => { el('pfPhoto').innerHTML = `<img src="${ev.target.result}" alt="">`; };
        reader.readAsDataURL(file);
    };

    el('pfSave').addEventListener('click', async () => {
        const btn = el('pfSave');
        const name = el('pfName').value.trim();

        if (!name) { ProfileHandler.showNotification('A name is required.', 'error'); return; }

        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
            // The photo first: if it fails the name is left untouched, rather
            // than half the change going through silently.
            if (chosenFile) await ProfileHandler.uploadImage(chosenFile, userEmail);
            if (name !== currentName()) await ProfileHandler.saveName(name, userEmail);
            ProfileHandler.showNotification('Profile updated.', 'success');
            close();
        } catch (err) {
            ProfileHandler.showNotification(err.message || 'Could not save.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save';
            fileInput.value = '';
        }
    });
}

window.initProfileUpload = initProfileUpload;
