const SUPABASE_URL = 'https://odhophykywqzmwiqbtyf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6qQAMHfZimo1Z8YuxCliBA_eGnbAieh';
const BUCKET_NAME = 'myfiles';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let rootPath = ''; // المسار الجذري الخاص بالمستخدم
let currentPath = '';
let pathHistory = [];
let currentItems = [];
let selectMode = false;
let selectedKeys = new Set();
let isUploading = false;
let authMode = 'login';
let currentSort = 'date_desc';

const filesGrid = document.getElementById('files-grid');

document.addEventListener("DOMContentLoaded", () => {
  const isList = localStorage.getItem('driveViewPref') === 'list';
  if (isList) {
    filesGrid.classList.add('list-view');
    document.getElementById('view-toggle-btn').innerHTML =
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;
  }
});

window.toggleView = function() {
  filesGrid.classList.toggle('list-view');
  const isList = filesGrid.classList.contains('list-view');
  localStorage.setItem('driveViewPref', isList ? 'list' : 'grid');

  const btn = document.getElementById('view-toggle-btn');
  if (isList) {
    btn.innerHTML =
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`;
  } else {
    btn.innerHTML =
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
  }
};

window.onpopstate = function() {
  const viewer = document.getElementById('viewer-modal');
  const dialog = document.getElementById('custom-dialog');
  const optionsModal = document.getElementById('options-modal');
  const sortModal = document.getElementById('sort-modal');

  if (viewer.style.display === 'flex') {
    document.getElementById('viewer-modal').style.display = 'none';
    document.getElementById('viewer-body').innerHTML = '';
  } else if (optionsModal && optionsModal.style.display === 'flex') {
    closeOptionsModal(true);
  } else if (sortModal && sortModal.style.display === 'flex') {
    closeSortModal(true);
  } else if (dialog.style.display === 'flex') {
    dialog.style.display = 'none';
  } else if (pathHistory.length > 0) {
    currentPath = pathHistory.pop().path;
    exitSelectMode();
    loadFiles();
  }
};

function encodeName(str) {
  return Array.from(new TextEncoder().encode(str)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function decodeName(hex) {
  try {
    const m = hex.match(/.{1,2}/g);
    if (!m) return hex;
    return new TextDecoder().decode(new Uint8Array(m.map(b => parseInt(b, 16))));
  } catch (e) {
    return hex;
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024,
    s = ['B', 'KB', 'MB', 'GB'],
    i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.innerText = str;
  return d.innerHTML;
}

function showToast(msg, type = 'info') {
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'success' ? 'success' : type === 'error' ? 'error' : '');
  el.innerText = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

window.addEventListener('beforeunload', (e) => {
  if (isUploading) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function getFileIcon(ext) {
  const e = (ext || '').toLowerCase();
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line></svg>`;
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
  if (['pdf'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
  if (['doc', 'docx'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
  if (['xls', 'xlsx', 'csv'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="21"></line><line x1="16" y1="13" x2="8" y2="21"></line></svg>`;
  if (['ppt', 'pptx'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><circle cx="12" cy="15" r="3"></circle></svg>`;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>`;
  if (['js', 'ts', 'html', 'css', 'py', 'json', 'jsx', 'tsx', 'java', 'c', 'cpp', 'sh'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.5"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
  if (['txt', 'md'].includes(e))
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
}
const isImage = (ext) => ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes((ext || '').toLowerCase());
const isVideo = (ext) => ['mp4', 'webm', 'ogg'].includes((ext || '').toLowerCase());
const isAudio = (ext) => ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes((ext || '').toLowerCase());

let longPressTimer;
window.startLongPress = function(e, name, isFolder, displayName, fullPath, fileUrl) {
  if (selectMode) return;
  longPressTimer = setTimeout(() => {
    if (window.navigator.vibrate) navigator.vibrate(50);
    openOptionsModal(name, isFolder, displayName, fullPath, fileUrl);
  }, 500);
};
window.cancelLongPress = function() {
  clearTimeout(longPressTimer);
};

const AppDialog = {
  show: function(title, msg, type, callback, extraData = null) {
    const overlay = document.getElementById('custom-dialog');
    document.getElementById('dialog-title').innerText = title;
    document.getElementById('dialog-msg').innerText = msg;
    document.getElementById('dialog-msg').style.display = msg ? 'block' : 'none';

    const input = document.getElementById('dialog-input');
    const folderPicker = document.getElementById('dialog-folder-picker');
    input.style.display = 'none';
    folderPicker.style.display = 'none';

    if (type === 'prompt') {
      input.style.display = 'block';
      input.value = extraData || '';
      setTimeout(() => {
        input.focus();
        input.select();
      }, 80);
    } else if (type === 'move') {
      folderPicker.style.display = 'block';
      folderPicker.innerHTML =
        '<div style="padding:14px; text-align:center; color:var(--text-light);">جاري البحث عن مجلدات...</div>';
      this.loadFoldersForPicker(extraData);
    }

    overlay.style.display = 'flex';

    const confirmBtn = document.getElementById('dialog-btn-confirm');
    const cancelBtn = document.getElementById('dialog-btn-cancel');
    const doConfirm = () => {
      if (type === 'prompt') {
        const val = input.value.trim();
        if (!val) return;
        overlay.style.display = 'none';
        callback(val);
      } else if (type === 'confirm') {
        overlay.style.display = 'none';
        callback(true);
      } else if (type === 'move') {
        const selected = folderPicker.querySelector('.selected');
        const targetPath = selected ? selected.dataset.path : '';
        overlay.style.display = 'none';
        callback(targetPath);
      }
    };
    confirmBtn.onclick = doConfirm;
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        doConfirm();
      }
    };
    cancelBtn.onclick = () => {
      overlay.style.display = 'none';
      if (type === 'confirm') callback(false);
    };
  },
  confirm: function(title, msg, callback) {
    this.show(title, msg, 'confirm', callback);
  },
  prompt: function(title, defaultVal, callback) {
    this.show(title, '', 'prompt', callback, defaultVal);
  },
  movePicker: function(itemPath, callback) {
    this.show('اختر المجلد الوجهة', '', 'move', callback, itemPath);
  },

  loadFoldersForPicker: async function(ignorePath) {
    const picker = document.getElementById('dialog-folder-picker');
    let allFolders = [{
      path: rootPath,
      displayName: 'الرئيسية (المجلد الأساسي)',
      icon: '📁'
    }];

    async function fetchFolders(currentPrefix) {
      const {
        data,
        error
      } = await supa.storage.from(BUCKET_NAME).list(currentPrefix, {
        limit: 1000
      });
      if (error || !data) return;

      for (const item of data) {
        if (!item.id && item.name !== '.emptyFolderPlaceholder') {
          const folderPath = currentPrefix + item.name + '/';
          if (!ignorePath || !folderPath.startsWith(ignorePath)) {
            const relativeFp = folderPath.substring(rootPath.length);
            const displayName = relativeFp.split('/').filter(p => p).map(decodeName).join(' / ');
            allFolders.push({
              path: folderPath,
              displayName: displayName,
              icon: '📂'
            });
            await fetchFolders(folderPath);
          }
        }
      }
    }

    await fetchFolders(rootPath);

    let html = '';
    allFolders.forEach((f, idx) => {
      const isSelected = idx === 0 ? 'selected' : '';
      html +=
        `<div class="folder-picker-item ${isSelected}" data-path="${f.path}" onclick="selectFolder(this)">${f.icon} ${escapeHtml(f.displayName)}</div>`;
    });

    picker.innerHTML = html;
  }
};
window.selectFolder = function(el) {
  document.querySelectorAll('.folder-picker-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
};

// تم حذف دالة switchAuthTab بالكامل لعدم الحاجة لها

document.getElementById('pw-toggle').onclick = () => {
  const pw = document.getElementById('password');
  pw.type = pw.type === 'password' ? 'text' : 'password';
};

async function checkUser() {
  const {
    data: {
      session
    }
  } = await supa.auth.getSession();
  if (session) {
    rootPath = session.user.id + '/';
    if (!currentPath.startsWith(rootPath)) {
      currentPath = rootPath;
      pathHistory = [];
    }
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    document.getElementById('logout-btn').style.display = 'block';
    document.getElementById('storage-badge').innerText = session.user.email || '';
    loadFiles();
  } else {
    rootPath = '';
    currentPath = '';
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('app-section').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('storage-badge').innerText = '';
  }
}
checkUser();

document.getElementById('auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) return;
  const btn = document.getElementById('auth-submit-btn');
  btn.disabled = true;
  const hint = document.getElementById('auth-hint');
  hint.style.color = 'var(--text-light)';
  hint.innerText = 'جاري تسجيل الدخول...';

  const {
    error
  } = await supa.auth.signInWithPassword({
    email,
    password
  });
  if (error) {
    hint.style.color = 'var(--danger)';
    hint.innerText = 'الإيميل أو كلمة المرور غير صحيحة';
  } else {
    hint.innerText = '';
    checkUser();
  }

  btn.disabled = false;
};
document.getElementById('logout-btn').onclick = async () => {
  await supa.auth.signOut();
  checkUser();
};

window.enterFolder = function(folderHexName) {
  history.pushState(null, null, location.href);
  pathHistory.push({
    path: currentPath
  });
  currentPath = currentPath + folderHexName + '/';
  exitSelectMode();
  loadFiles();
};

window.goUpFolder = function() {
  if (pathHistory.length > 0) {
    history.back();
  }
};

window.goToBreadcrumb = function(index) {
  if (index < 0) {
    currentPath = rootPath;
    pathHistory = [];
  } else {
    currentPath = pathHistory[index].path;
    pathHistory = pathHistory.slice(0, index);
  }
  exitSelectMode();
  loadFiles();
};

function updateBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  const relativePath = currentPath.substring(rootPath.length);
  const parts = relativePath.split('/').filter(p => p);

  document.getElementById('back-folder-btn').style.display = pathHistory.length > 0 ? 'inline-flex' : 'none';

  let html =
    `<span class="crumb ${parts.length === 0 ? 'current' : ''}" onclick="goToBreadcrumb(-1)">🏠 الرئيسية</span>`;
  let acc = rootPath;
  parts.forEach((hex, i) => {
    acc += hex + '/';
    const isLast = i === parts.length - 1;
    html +=
      `<span class="crumb-sep">/</span><span class="crumb ${isLast ? 'current' : ''}" ${isLast ? '' : `onclick="goToBreadcrumbPath(${i})"`}>${escapeHtml(decodeName(hex))}</span>`;
  });
  el.innerHTML = html;
  window.__crumbParts = parts;
}

window.goToBreadcrumbPath = function(i) {
  const parts = window.__crumbParts || [];
  currentPath = rootPath + parts.slice(0, i + 1).join('/') + '/';
  pathHistory = [];
  let acc = rootPath;
  for (let j = 0; j <= i; j++) {
    pathHistory.push({
      path: acc
    });
    acc += parts[j] + '/';
  }
  exitSelectMode();
  loadFiles();
};

window.toggleSelectMode = function() {
  selectMode = !selectMode;
  selectedKeys.clear();
  document.getElementById('files-grid').classList.toggle('select-mode', selectMode);

  const btn = document.getElementById('select-mode-btn');
  if (selectMode) {
    btn.innerHTML =
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    btn.title = 'إلغاء التحديد';
    btn.classList.remove('btn-light');
    btn.classList.add('btn-danger');
  } else {
    btn.innerHTML =
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
    btn.title = 'تحديد';
    btn.classList.add('btn-light');
    btn.classList.remove('btn-danger');
  }

  updateSelectionBar();
  renderGrid();
};

function exitSelectMode() {
  if (selectMode) toggleSelectMode();
}

function updateSelectionBar() {
  const bar = document.getElementById('selection-bar');
  bar.style.display = selectMode && selectedKeys.size > 0 ? 'flex' : 'none';
  document.getElementById('selection-count').innerText = `تم تحديد ${selectedKeys.size} عنصر`;
}
window.toggleItemSelect = function(key, isFolder, event) {
  event.stopPropagation();
  if (selectedKeys.has(key)) selectedKeys.delete(key);
  else selectedKeys.add(key);
  updateSelectionBar();
  renderGrid();
};

window.bulkDelete = function() {
  AppDialog.confirm('حذف العناصر المحددة', `سيتم حذف ${selectedKeys.size} عنصر نهائياً. متابعة؟`, async (
    ok) => {
    if (!ok) return;
    showToast('جاري الحذف...');
    for (const key of selectedKeys) {
      const [name, isFolder] = key.split('|||');
      await deleteItemInternal(name, isFolder === '1');
    }
    showToast('تم حذف العناصر المحددة ✅', 'success');
    toggleSelectMode();
    loadFiles();
  });
};
window.bulkMove = function() {
  AppDialog.movePicker('', async (targetFolder) => {
    showToast('جاري النقل...');
    for (const key of selectedKeys) {
      const [name, isFolder] = key.split('|||');
      await moveItemInternal(name, isFolder === '1', targetFolder);
    }
    showToast('تم نقل العناصر المحددة ✅', 'success');
    toggleSelectMode();
    loadFiles();
  });
};

window.promptNewFolder = function() {
  AppDialog.prompt('اسم المجلد الجديد', '', async (fname) => {
    const path = currentPath + encodeName(fname) + '/.emptyFolderPlaceholder';
    const {
      error
    } = await supa.storage.from(BUCKET_NAME).upload(path, new Blob(['']));
    if (error) {
      showToast('تعذر إنشاء المجلد: ' + error.message, 'error');
      return;
    }
    showToast('تم إنشاء المجلد 📁', 'success');
    loadFiles();
  });
};

// دالة هندسية ذكية لجلب كل محتويات المجلد مهما كان عمق المجلدات الفرعية مع إرجاع البيانات الوصفية (Metadata)
async function getAllFilesDeep(prefix) {
  let files = [];
  const {
    data,
    error
  } = await supa.storage.from(BUCKET_NAME).list(prefix, {
    limit: 1000
  });
  if (data && !error) {
    for (const item of data) {
      if (item.id) {
        files.push({
          path: prefix + item.name,
          size: item.metadata?.size || 0,
          date: new Date(item.created_at),
          isPlaceholder: item.name === '.emptyFolderPlaceholder'
        });
      } else {
        const subFiles = await getAllFilesDeep(prefix + item.name + '/');
        files.push(...subFiles);
      }
    }
  }
  return files;
}

window.renameItem = function(path, isFolder, oldDecodedName) {
  AppDialog.prompt('تعديل الاسم', oldDecodedName, async (newName) => {
    if (newName === oldDecodedName) return;
    showToast('جاري التعديل...');
    try {
      if (isFolder) {
        const oldPrefix = currentPath + path + '/';
        const newPrefix = currentPath + encodeName(newName) + '/';
        const allFiles = await getAllFilesDeep(oldPrefix);
        for (const f of allFiles) {
          const newFilePath = f.path.replace(oldPrefix, newPrefix);
          await supa.storage.from(BUCKET_NAME).move(f.path, newFilePath);
        }
      } else {
        const extIdx = path.lastIndexOf('.');
        const ext = extIdx !== -1 ? path.substring(extIdx) : '';
        const newFileName = Date.now() + '_hex_' + encodeName(newName) + ext;
        await supa.storage.from(BUCKET_NAME).move(currentPath + path, currentPath + newFileName);
      }
      showToast('تم التعديل ✅', 'success');
    } catch (e) {
      showToast('حدث خطأ أثناء التعديل', 'error');
    }
    loadFiles();
  });
};

async function moveItemInternal(path, isFolder, targetFolder) {
  try {
    const fullPath = currentPath + path + (isFolder ? '/' : '');
    if (isFolder) {
      const newPrefix = targetFolder + path + '/';
      const allFiles = await getAllFilesDeep(fullPath);
      for (const f of allFiles) {
        const newFilePath = f.path.replace(fullPath, newPrefix);
        await supa.storage.from(BUCKET_NAME).move(f.path, newFilePath);
      }
    } else {
      await supa.storage.from(BUCKET_NAME).move(fullPath, targetFolder + path);
    }
  } catch (e) {}
}

window.moveItem = function(path, isFolder) {
  const fullPath = currentPath + path + (isFolder ? '/' : '');
  AppDialog.movePicker(fullPath, async (targetFolder) => {
    showToast('جاري النقل...');
    await moveItemInternal(path, isFolder, targetFolder);
    showToast('تم النقل ✅', 'success');
    loadFiles();
  });
};

async function deleteItemInternal(path, isFolder) {
  if (isFolder) {
    const prefix = currentPath + path + '/';
    const allFiles = await getAllFilesDeep(prefix);
    if (allFiles.length > 0) {
      await supa.storage.from(BUCKET_NAME).remove(allFiles.map(f => f.path));
    }
  } else {
    await supa.storage.from(BUCKET_NAME).remove([currentPath + path]);
  }
}
window.deleteItem = function(path, isFolder) {
  AppDialog.confirm('تأكيد الحذف', 'هل أنت متأكد أنك تريد حذف هذا العنصر نهائياً؟', async (confirmed) => {
    if (!confirmed) return;
    showToast('جاري الحذف...');
    await deleteItemInternal(path, isFolder);
    showToast('تم الحذف 🗑️', 'success');
    loadFiles();
  });
};

function uploadFileWithProgress(path, file, onProgress) {
  return new Promise(async (resolve, reject) => {
    const {
      data: {
        session
      }
    } = await supa.auth.getSession();
    if (!session) return reject(new Error('غير مسجل الدخول'));
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${encodedPath}`);
    xhr.setRequestHeader('Authorization', 'Bearer ' + session.access_token);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('فشل الرفع'));
    };
    xhr.onerror = () => reject(new Error('خطأ في الشبكة'));
    xhr.send(file);
  });
}

function addUploadRow(id, name) {
  const queue = document.getElementById('upload-queue');
  const row = document.createElement('div');
  row.className = 'upload-row';
  row.id = 'upload-' + id;
  row.innerHTML =
    `<div class="upload-row-top"><span class="upload-row-name">${escapeHtml(name)}</span><span class="upload-row-status" id="upload-status-${id}">0%</span></div><div class="progress-track"><div class="progress-fill" id="upload-fill-${id}"></div></div>`;
  queue.appendChild(row);
}

function updateUploadRow(id, pct) {
  const fill = document.getElementById('upload-fill-' + id);
  const status = document.getElementById('upload-status-' + id);
  if (fill) fill.style.width = Math.round(pct * 100) + '%';
  if (status) status.innerText = Math.round(pct * 100) + '%';
}

function finishUploadRow(id, ok) {
  const fill = document.getElementById('upload-fill-' + id);
  const status = document.getElementById('upload-status-' + id);
  if (fill) fill.classList.add(ok ? 'done' : 'error');
  if (status) status.innerText = ok ? 'تم ✅' : 'فشل ❌';
  setTimeout(() => {
    const row = document.getElementById('upload-' + id);
    if (row) row.remove();
  }, ok ? 2000 : 4000);
}

document.getElementById('drop-zone').onclick = () => document.getElementById('file-input').click();
document.getElementById('file-input').onchange = (e) => {
  handleFiles(e.target.files);
  e.target.value = '';
};

let dragCounter = 0;
['dragenter'].forEach(evt => document.body.addEventListener(evt, (e) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
  e.preventDefault();
  dragCounter++;
  document.body.classList.add('dragging-file');
}));
['dragover'].forEach(evt => document.body.addEventListener(evt, (e) => {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
  e.preventDefault();
}));
['dragleave'].forEach(evt => document.body.addEventListener(evt, (e) => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) document.body.classList.remove('dragging-file');
}));
document.body.addEventListener('drop', (e) => {
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault();
  dragCounter = 0;
  document.body.classList.remove('dragging-file');
  if (document.getElementById('app-section').style.display === 'none') return;
  handleFiles(e.dataTransfer.files);
});

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  isUploading = true;
  let successCount = 0,
    failCount = 0;
  await Promise.all(files.map(async (file, idx) => {
    const id = Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 7);
    addUploadRow(id, file.name);
    const extIdx = file.name.lastIndexOf('.');
    let ext = '',
      nameToEncode = file.name;
    if (extIdx !== -1) {
      ext = file.name.substring(extIdx);
      nameToEncode = file.name.substring(0, extIdx);
    }
    const fileName = Date.now() + '_hex_' + encodeName(nameToEncode) + ext;
    try {
      await uploadFileWithProgress(currentPath + fileName, file, (pct) => updateUploadRow(id, pct));
      finishUploadRow(id, true);
      successCount++;
    } catch (e) {
      finishUploadRow(id, false);
      failCount++;
    }
  }));
  isUploading = false;
  if (successCount) showToast(`تم رفع ${successCount} ملف بنجاح 🎉`, 'success');
  if (failCount) showToast(`فشل رفع ${failCount} ملف`, 'error');
  loadFiles();
}

window.downloadFile = async function(fullPath, originalName) {
  showToast('جاري تجهيز التنزيل...');
  const {
    data,
    error
  } = await supa.storage.from(BUCKET_NAME).download(fullPath);
  if (error) {
    showToast('تعذر تنزيل الملف', 'error');
    return;
  }
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = originalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// دالة جديدة لتوليد رابط مشفر صالح لمدة ساعة فقط
window.copyPrivateLink = async function(fullPath) {
  showToast('جاري إنشاء رابط آمن...');
  const {
    data,
    error
  } = await supa.storage.from(BUCKET_NAME).createSignedUrl(fullPath, 3600);
  if (error || !data) {
    showToast('تعذر إنشاء الرابط', 'error');
    return;
  }
  navigator.clipboard.writeText(data.signedUrl).then(() => showToast('تم نسخ الرابط المؤقت 🔗', 'success'))
    .catch(() => showToast('تعذر النسخ', 'error'));
};

window.closeOptionsModal = function(fromHistory = false) {
  if (!fromHistory) {
    history.back();
  } else {
    document.getElementById('options-modal').style.display = 'none';
    document.getElementById('options-modal-content').innerHTML = '';
  }
};

window.openSortModal = function() {
  document.querySelectorAll('.sort-check').forEach(el => el.innerText = '');
  document.getElementById('check-' + currentSort).innerText = '✔';
  history.pushState(null, null, location.href);
  document.getElementById('sort-modal').style.display = 'flex';
};

window.closeSortModal = function(fromHistory = false) {
  if (!fromHistory) {
    history.back();
  } else {
    document.getElementById('sort-modal').style.display = 'none';
  }
};

window.applySort = function(sortValue) {
  currentSort = sortValue;
  executeAfterClose(() => {
    renderGrid();
    showToast('تم ترتيب الملفات', 'success');
  });
};

window.executeAfterClose = function(callback) {
  const handler = function() {
    window.removeEventListener('popstate', handler);
    setTimeout(callback, 10);
  };
  window.addEventListener('popstate', handler);
  history.back();
};

// تم إزالة fileUrl من المدخلات لأنه لم يعد مفيداً للمجلدات الخاصة
window.openOptionsModal = function(name, isFolder, displayName, fullPath) {
  if (selectMode) return;
  const content = document.getElementById('options-modal-content');

  let html = '';
  if (isFolder) {
    html = `
          <button onclick="executeAfterClose(() => renameItem('${escapeAttr(name)}', true, '${escapeAttr(displayName)}'))"><span style="opacity:0.7; font-size:1.1rem;">✏️</span> <span>تعديل الاسم</span></button>
          <button onclick="executeAfterClose(() => moveItem('${escapeAttr(name)}', true))"><span style="opacity:0.7; font-size:1.1rem;">📁</span> <span>نقل المجلد</span></button>
          <div class="divider"></div>
          <button class="text-red" onclick="executeAfterClose(() => deleteItem('${escapeAttr(name)}', true))"><span style="opacity:0.7; font-size:1.1rem;">🗑️</span> <span>حذف بالكامل</span></button>
        `;
  } else {
    html = `
          <button onclick="executeAfterClose(() => downloadFile('${escapeAttr(fullPath)}', '${escapeAttr(displayName)}'))"><span style="opacity:0.7; font-size:1.1rem;">⬇️</span> <span>تنزيل الملف</span></button>
          <button onclick="executeAfterClose(() => renameItem('${escapeAttr(name)}', false, '${escapeAttr(displayName.includes('.') ? displayName.substring(0, displayName.lastIndexOf('.')) : displayName)}'))"><span style="opacity:0.7; font-size:1.1rem;">✏️</span> <span>تعديل الاسم</span></button>
          <button onclick="executeAfterClose(() => moveItem('${escapeAttr(name)}', false))"><span style="opacity:0.7; font-size:1.1rem;">📁</span> <span>نقل الملف</span></button>
          <button onclick="executeAfterClose(() => copyPrivateLink('${escapeAttr(fullPath)}'))"><span style="opacity:0.7; font-size:1.1rem;">🔗</span> <span>نسخ رابط مؤقت</span></button>
          <div class="divider"></div>
          <button class="text-red" onclick="executeAfterClose(() => deleteItem('${escapeAttr(name)}', false))"><span style="opacity:0.7; font-size:1.1rem;">🗑️</span> <span>حذف نهائي</span></button>
        `;
  }
  content.innerHTML = html;
  history.pushState(null, null, location.href);
  document.getElementById('options-modal').style.display = 'flex';
};

window.openViewer = async function(url, type, name, fullPath) {
  const body = document.getElementById('viewer-body');
  document.getElementById('viewer-title').innerText = name;
  document.getElementById('viewer-download-btn').onclick = () => window.downloadFile(fullPath, name);

  body.innerHTML = '<div style="padding:40px; color:white; font-size:1.1rem;">جاري التحميل... ⏳</div>';
  history.pushState(null, null, location.href);
  document.getElementById('viewer-modal').style.display = 'flex';

  const {
    data,
    error
  } = await supa.storage.from(BUCKET_NAME).createSignedUrl(fullPath, 3600);

  if (error || !data) {
    body.innerHTML =
      `<p style="color:var(--danger); padding: 30px;">❌ تعذر عرض الملف. تأكد من الصلاحيات.</p>`;
    return;
  }

  const secureUrl = data.signedUrl;

  if (isImage(type)) body.innerHTML = `<img src="${secureUrl}" class="modal-media">`;
  else if (isVideo(type)) body.innerHTML =
    `<video src="${secureUrl}" controls class="modal-media" autoplay playsinline style="width:100%;"></video>`;
  else if (isAudio(type)) body.innerHTML =
    `<div style="padding: 36px; text-align:center; width:100%;"><svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" stroke-width="1.5"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg><br><audio src="${secureUrl}" controls autoplay style="margin-top:26px; width:100%; max-width:400px;"></audio></div>`;
  else body.innerHTML =
    `<p style="color:white; padding: 30px; font-size:1rem;">هذا النوع من الملفات لا يمكن معاينته مباشرة. يمكنك تنزيله بدلاً من ذلك.</p>`;
};

window.closeViewer = function(fromHistory = false) {
  history.back();
};

document.getElementById('search-input').addEventListener('input', () => renderGrid());

async function loadFiles() {
  updateBreadcrumb();
  filesGrid.innerHTML = '';
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-grid';
  skeleton.id = 'skeleton';
  for (let i = 0; i < 6; i++) {
    const c = document.createElement('div');
    c.className = 'skeleton-card';
    skeleton.appendChild(c);
  }
  filesGrid.appendChild(skeleton);

  const {
    data,
    error
  } = await supa.storage.from(BUCKET_NAME).list(currentPath, {
    limit: 1000,
    sortBy: {
      column: 'created_at',
      order: 'desc'
    }
  });
  if (error) {
    filesGrid.innerHTML = '';
    showToast('تعذر تحميل الملفات', 'error');
    renderEmpty('تعذر تحميل محتوى هذا المجلد.');
    return;
  }
  currentItems = (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');

  renderGrid();

  // جلب بيانات المجلدات بالخلفية (Lazy Loading) بدون تعليق الواجهة
  const folders = currentItems.filter(f => !f.id);
  folders.forEach(async (folder) => {
    if (folder._stats) return;
    const allFiles = await getAllFilesDeep(currentPath + folder.name + '/');
    let size = 0,
      count = 0;
    let latestDate = null;
    allFiles.forEach(f => {
      if (!f.isPlaceholder) count++;
      size += f.size;
      if (!latestDate || f.date > latestDate) latestDate = f.date;
    });
    if (!latestDate && allFiles.length > 0) latestDate = allFiles[0].date;

    folder._stats = {
      count,
      size,
      date: latestDate
    };

    const metaEl = document.getElementById('meta-folder-' + encodeName(folder.name));
    if (metaEl) {
      const dStr = folder._stats.date ? folder._stats.date.toLocaleDateString('ar-LB', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : '-';
      const sizeStr = formatSize(folder._stats.size);
      metaEl.innerHTML = `<span>${folder._stats.count} ملف • ${sizeStr}</span><span>${dStr}</span>`;
    }
  });
}

function renderEmpty(msg) {
  filesGrid.innerHTML =
    `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><p>${escapeHtml(msg)}</p></div>`;
}

function getSortedFilteredItems() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const sortVal = currentSort;
  const folders = [],
    files = [];
  currentItems.forEach(item => {
    const isFolder = !item.id;
    let displayName;
    if (isFolder) displayName = decodeName(item.name);
    else {
      displayName = item.name;
      if (item.name.includes('_hex_')) {
        const parts = item.name.split('_hex_');
        let hexPart = parts[1],
          extI = hexPart.lastIndexOf('.'),
          ext = '';
        if (extI !== -1) {
          ext = hexPart.substring(extI);
          hexPart = hexPart.substring(0, extI);
        }
        displayName = decodeName(hexPart) + ext;
      }
    }
    if (query && !displayName.toLowerCase().includes(query)) return;
    (isFolder ? folders : files).push({
      item,
      displayName,
      isFolder
    });
  });
  folders.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar'));
  if (sortVal === 'name_asc') files.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar'));
  else if (sortVal === 'date_asc') files.sort((a, b) => new Date(a.item.created_at) - new Date(b.item
    .created_at));
  else if (sortVal === 'size_desc') files.sort((a, b) => (b.item.metadata?.size || 0) - (a.item.metadata?.size ||
    0));
  else files.sort((a, b) => new Date(b.item.created_at) - new Date(a.item.created_at));
  return [...folders, ...files];
}

function renderGrid() {
  const skeleton = document.getElementById('skeleton');
  if (skeleton) skeleton.remove();
  const combined = getSortedFilteredItems();
  document.getElementById('storage-badge').dataset.base = document.getElementById('storage-badge').dataset.base ||
    document.getElementById('storage-badge').innerText;

  if (combined.length === 0) {
    const q = document.getElementById('search-input').value.trim();
    renderEmpty(q ? `لا توجد نتائج مطابقة لـ "${q}"` :
      'هذا المجلد فارغ حالياً. ابدأ برفع ملف أو إنشاء مجلد جديد.');
    return;
  }

  filesGrid.innerHTML = '';
  combined.forEach(({
    item,
    displayName,
    isFolder
  }) => {
    const key = item.name + '|||' + (isFolder ? '1' : '0');
    const isSelected = selectedKeys.has(key);
    const card = document.createElement('div');
    card.className = 'file-card' + (isSelected ? ' selected' : '');

    card.setAttribute('oncontextmenu',
      `event.preventDefault(); startLongPress(event, '${escapeAttr(item.name)}', ${isFolder}, '${escapeAttr(displayName)}', '${escapeAttr(isFolder ? '' : currentPath + item.name)}', '${escapeAttr(isFolder ? '' : supa.storage.from(BUCKET_NAME).getPublicUrl(currentPath + item.name).data.publicUrl)}')`
    );
    card.setAttribute('ontouchstart',
      `startLongPress(event, '${escapeAttr(item.name)}', ${isFolder}, '${escapeAttr(displayName)}', '${escapeAttr(isFolder ? '' : currentPath + item.name)}', '${escapeAttr(isFolder ? '' : supa.storage.from(BUCKET_NAME).getPublicUrl(currentPath + item.name).data.publicUrl)}')`
    );
    card.setAttribute('ontouchend', `cancelLongPress()`);
    card.setAttribute('ontouchmove', `cancelLongPress()`);

    if (isFolder) {
      let metaHtml = `<span style="opacity:0.6;">جاري الحساب...</span>`;
      if (item._stats) {
        const dStr = item._stats.date ? item._stats.date.toLocaleDateString('ar-LB', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }) : '-';
        const sizeStr = formatSize(item._stats.size);
        metaHtml = `<span>${item._stats.count} ملف • ${sizeStr}</span><span>${dStr}</span>`;
      }

      card.innerHTML = `
            <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleItemSelect('${escapeAttr(key)}', true, event)">
            <div class="file-preview folder-preview">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <div class="file-info" style="cursor:pointer;">
              <div class="file-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
              <div class="file-meta" id="meta-folder-${encodeName(item.name)}">${metaHtml}</div>
            </div>
            <button class="more-btn" onclick="event.stopPropagation(); openOptionsModal('${escapeAttr(item.name)}', true, '${escapeAttr(displayName)}', '', '')">⋮</button>
          `;
      const openAction = () => selectMode ? toggleItemSelect(key, true, {
        stopPropagation() {}
      }) : enterFolder(item.name);
      card.querySelector('.file-preview').onclick = openAction;
      card.querySelector('.file-info').onclick = openAction;
      filesGrid.appendChild(card);
    } else {
      const fullPath = currentPath + item.name;
      const ext = displayName.split('.').pop();
      const dateStr = new Date(item.created_at).toLocaleString('ar-LB', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const sizeStr = formatSize(item.metadata?.size);

      // عرض أيقونة شفافة للصور لبين ما يتم جلب الرابط المشفر
      const previewHtml = isImage(ext) ?
        `<img id="thumb-${item.id}" class="thumb" loading="lazy" style="opacity: 0.1; transition: opacity 0.3s;">` :
        getFileIcon(ext);

      card.innerHTML = `
            <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} onclick="toggleItemSelect('${escapeAttr(key)}', false, event)">
            <div class="file-preview">${previewHtml}</div>
            <div class="file-info">
              <div class="file-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
              <div class="file-meta"><span>${sizeStr}</span><span dir="ltr">${dateStr}</span></div>
            </div>
            <button class="more-btn" onclick="event.stopPropagation(); openOptionsModal('${escapeAttr(item.name)}', false, '${escapeAttr(displayName.includes('.') ? displayName.substring(0, displayName.lastIndexOf('.')) : displayName)}', '${escapeAttr(fullPath)}')">⋮</button>
          `;
      const fileAction = () => selectMode ? toggleItemSelect(key, false, {
        stopPropagation() {}
      }) : openViewer(null, ext, displayName, fullPath);
      card.querySelector('.file-preview').onclick = fileAction;
      card.querySelector('.file-info').onclick = fileAction;
      card.querySelector('.file-info').style.cursor = 'pointer';
      filesGrid.appendChild(card);

      // جلب الرابط المشفر للصورة بالخلفية بدون تعليق المتصفح
      if (isImage(ext)) {
        supa.storage.from(BUCKET_NAME).createSignedUrl(fullPath, 3600).then(({
          data
        }) => {
          if (data && data.signedUrl) {
            const imgEl = document.getElementById(`thumb-${item.id}`);
            if (imgEl) {
              imgEl.src = data.signedUrl;
              imgEl.style.opacity = '1';
            }
          }
        });
      }
    }
  });
}