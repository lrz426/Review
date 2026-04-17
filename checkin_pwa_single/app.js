const STORAGE_KEY = 'checkin_pwa_single_v1';

const ENCOURAGE_MESSAGES = [
  '太棒了，今天目标达成，继续保持这个节奏。',
  '你又完成了一次打卡，行动力非常稳。',
  '做得很好，小步前进也能走出很远。',
  '今天的坚持很有价值，给自己点个赞。',
];

const COMFORT_MESSAGES = [
  '今天没完全做到也没关系，我们明天继续。',
  '进度慢一点也可以，先照顾好自己。',
  '没完成不代表失败，愿意继续就是进步。',
  '辛苦了，先放松一下，明天再出发。',
];

const state = {
  currentDate: '',
  tasksByDate: {},
};

let deferredInstallPrompt = null;

const els = {
  dateInput: document.getElementById('dateInput'),
  todayBtn: document.getElementById('todayBtn'),
  tomorrowBtn: document.getElementById('tomorrowBtn'),
  addTaskForm: document.getElementById('addTaskForm'),
  taskInput: document.getElementById('taskInput'),
  taskList: document.getElementById('taskList'),
  taskMeta: document.getElementById('taskMeta'),
  checkinBtn: document.getElementById('checkinBtn'),
  cloneBtn: document.getElementById('cloneBtn'),
  feedbackCard: document.getElementById('feedbackCard'),
  feedbackText: document.getElementById('feedbackText'),
  installBtn: document.getElementById('installBtn'),
  installHint: document.getElementById('installHint'),
};

document.addEventListener('DOMContentLoaded', () => {
  bootstrap();
});

function bootstrap() {
  loadStore();
  state.currentDate = formatLocalDate(new Date());
  els.dateInput.value = state.currentDate;

  bindEvents();
  renderTaskList();
  initInstallFlow();
  registerServiceWorker();
}

function bindEvents() {
  els.dateInput.addEventListener('change', (event) => {
    state.currentDate = event.target.value;
    hideFeedback();
    renderTaskList();
  });

  els.todayBtn.addEventListener('click', () => {
    state.currentDate = formatLocalDate(new Date());
    els.dateInput.value = state.currentDate;
    hideFeedback();
    renderTaskList();
  });

  els.tomorrowBtn.addEventListener('click', () => {
    state.currentDate = offsetDate(state.currentDate, 1);
    els.dateInput.value = state.currentDate;
    hideFeedback();
    renderTaskList();
  });

  els.addTaskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = (els.taskInput.value || '').trim();

    if (!title) {
      showToast('请先输入任务内容');
      return;
    }

    if (title.length > 80) {
      showToast('任务内容请控制在 80 个字以内');
      return;
    }

    const tasks = getTasks(state.currentDate);
    tasks.unshift({
      id: createId(),
      title,
      completed: false,
      createdAt: new Date().toISOString(),
    });

    setTasks(state.currentDate, tasks);
    els.taskInput.value = '';
    hideFeedback();
    renderTaskList();
    showToast('任务已添加');
  });

  els.taskList.addEventListener('change', (event) => {
    const target = event.target;
    if (!target.matches('input[type="checkbox"][data-id]')) {
      return;
    }

    const taskId = String(target.dataset.id);
    const completed = target.checked;

    const tasks = getTasks(state.currentDate).map((task) => {
      if (task.id === taskId) {
        return { ...task, completed };
      }
      return task;
    });

    setTasks(state.currentDate, tasks);
    renderTaskList();

    const feedback = completed
      ? pickOne(ENCOURAGE_MESSAGES)
      : pickOne(COMFORT_MESSAGES);
    showFeedback(feedback, completed ? 'encourage' : 'comfort');
    showToast(completed ? '完成打卡，做得好' : '状态已更新，慢慢来');
  });

  els.taskList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-delete-id]');
    if (!button) {
      return;
    }

    const taskId = String(button.dataset.deleteId);
    const tasks = getTasks(state.currentDate).filter((task) => task.id !== taskId);
    setTasks(state.currentDate, tasks);

    hideFeedback();
    renderTaskList();
    showToast('任务已删除');
  });

  els.checkinBtn.addEventListener('click', () => {
    const summary = getSummary(state.currentDate);
    let message = '';
    let tone = 'comfort';

    if (summary.total === 0) {
      message = '今天还没有任务，先给自己定一个小目标吧。';
    } else if (summary.completed === summary.total) {
      const streak = calculatePerfectStreak(state.currentDate);
      const base = pickOne(ENCOURAGE_MESSAGES);
      message = streak >= 2 ? `${base} 连续全完成 ${streak} 天，状态很稳。` : base;
      tone = 'encourage';
    } else if (summary.completed === 0) {
      message = pickOne(COMFORT_MESSAGES);
    } else {
      message = `你今天完成了 ${summary.completed}/${summary.total} 项，已经很不错。剩下的任务我们明天继续。`;
    }

    showFeedback(`${message}（待完成 ${summary.pending}）`, tone);
  });

  els.cloneBtn.addEventListener('click', () => {
    const sourceTasks = getTasks(state.currentDate);
    const unfinished = sourceTasks.filter((task) => !task.completed);

    if (!unfinished.length) {
      showToast('今天没有未完成任务，明天可以从零开始。');
      return;
    }

    const targetDate = offsetDate(state.currentDate, 1);
    const targetTasks = getTasks(targetDate);
    const titleSet = new Set(targetTasks.map((task) => normalizeTitle(task.title)));

    let inserted = 0;
    for (const task of unfinished) {
      const key = normalizeTitle(task.title);
      if (titleSet.has(key)) {
        continue;
      }
      titleSet.add(key);
      targetTasks.unshift({
        id: createId(),
        title: task.title,
        completed: false,
        createdAt: new Date().toISOString(),
      });
      inserted += 1;
    }

    setTasks(targetDate, targetTasks);
    showToast(`已复制 ${inserted} 项未完成任务到 ${targetDate}`);
  });

  els.installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      showToast('当前环境暂不支持自动安装提示');
      return;
    }

    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') {
      showToast('已添加到主屏幕');
    }

    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });
}

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.tasksByDate = {};
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const tasksByDate = parsed && typeof parsed === 'object' ? parsed.tasksByDate : {};
    state.tasksByDate = tasksByDate && typeof tasksByDate === 'object' ? tasksByDate : {};
  } catch {
    state.tasksByDate = {};
  }
}

function persistStore() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      tasksByDate: state.tasksByDate,
      updatedAt: new Date().toISOString(),
    })
  );
}

function getTasks(dateKey) {
  const tasks = state.tasksByDate[dateKey];
  if (!Array.isArray(tasks)) {
    return [];
  }
  return tasks.map((task) => ({ ...task }));
}

function setTasks(dateKey, tasks) {
  state.tasksByDate[dateKey] = tasks;
  persistStore();
}

function renderTaskList() {
  const tasks = getTasks(state.currentDate);
  els.taskList.innerHTML = '';

  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  els.taskMeta.textContent = `${completed}/${total} 完成`;

  if (!total) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '这一天还没有任务，先添加一个小目标吧。';
    els.taskList.appendChild(empty);
    return;
  }

  for (const task of tasks) {
    const item = document.createElement('div');
    item.className = 'task-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!task.completed;
    checkbox.dataset.id = task.id;

    const title = document.createElement('p');
    title.className = 'task-title';
    title.textContent = task.title;
    if (task.completed) {
      title.classList.add('done');
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'task-delete';
    del.dataset.deleteId = task.id;
    del.textContent = '删除';

    item.appendChild(checkbox);
    item.appendChild(title);
    item.appendChild(del);
    els.taskList.appendChild(item);
  }
}

function getSummary(dateKey) {
  const tasks = getTasks(dateKey);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  return {
    total,
    completed,
    pending: total - completed,
  };
}

function calculatePerfectStreak(endDate) {
  let streak = 0;
  let cursor = endDate;

  for (let i = 0; i < 366; i += 1) {
    const summary = getSummary(cursor);
    if (!summary.total || summary.completed < summary.total) {
      break;
    }
    streak += 1;
    cursor = offsetDate(cursor, -1);
  }

  return streak;
}

function showFeedback(text, tone) {
  els.feedbackText.textContent = text;
  els.feedbackCard.hidden = false;
  els.feedbackCard.classList.remove('comfort');
  if (tone === 'comfort') {
    els.feedbackCard.classList.add('comfort');
  }
}

function hideFeedback() {
  els.feedbackText.textContent = '';
  els.feedbackCard.hidden = true;
  els.feedbackCard.classList.remove('comfort');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 1800);
}

function createId() {
  const random = Math.random().toString(16).slice(2, 10);
  return `${Date.now()}_${random}`;
}

function pickOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeTitle(title) {
  return (title || '').trim().toLowerCase();
}

function offsetDate(isoDate, offsetDays) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const base = new Date(year, month - 1, day);
  base.setDate(base.getDate() + offsetDays);
  return formatLocalDate(base);
}

function formatLocalDate(value) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function initInstallFlow() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const userAgent = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);

  if (isStandalone) {
    els.installHint.textContent = '已安装到主屏幕，直接点图标即可使用。';
    return;
  }

  if (isIOS) {
    els.installHint.textContent = 'iPhone: Safari 打开后，点“分享”再点“添加到主屏幕”。';
  } else {
    els.installHint.textContent = '支持安装时会显示“安装到手机桌面”按钮。';
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.hidden = false;
    els.installHint.textContent = '点击按钮即可安装到主屏幕。';
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
    els.installHint.textContent = '安装完成，今后可以从桌面直接打开。';
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Service worker failure should not block the app.
    });
  });
}
