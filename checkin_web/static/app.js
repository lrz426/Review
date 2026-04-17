const state = {
    users: [],
    currentUserId: null,
    currentDate: '',
    tasks: [],
};

const els = {
    userSwitch: document.getElementById('userSwitch'),
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
};

document.addEventListener('DOMContentLoaded', () => {
    init().catch((error) => {
        console.error(error);
        showToast(error.message || '初始化失败，请刷新重试');
    });
});

async function init() {
    const data = await api('/api/bootstrap');
    state.users = Array.isArray(data.users) ? data.users : [];

    if (!state.users.length) {
        throw new Error('未找到用户配置，请检查后端设置');
    }

    state.currentDate = data.today;
    els.dateInput.value = state.currentDate;

    const storedUserId = Number(localStorage.getItem('checkin_user_id'));
    const defaultUser = state.users.find((user) => user.id === storedUserId) || state.users[0];
    state.currentUserId = defaultUser.id;

    bindEvents();
    renderUserSwitch();
    await loadTasks();
}

function bindEvents() {
    els.dateInput.addEventListener('change', async (event) => {
        state.currentDate = event.target.value;
        hideFeedback();
        await loadTasks();
    });

    els.todayBtn.addEventListener('click', async () => {
        state.currentDate = formatLocalDate(new Date());
        els.dateInput.value = state.currentDate;
        hideFeedback();
        await loadTasks();
    });

    els.tomorrowBtn.addEventListener('click', async () => {
        state.currentDate = offsetDate(state.currentDate || formatLocalDate(new Date()), 1);
        els.dateInput.value = state.currentDate;
        hideFeedback();
        await loadTasks();
    });

    els.addTaskForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = els.taskInput.value.trim();

        if (!title) {
            showToast('请先输入任务内容');
            return;
        }

        await api('/api/tasks', {
            method: 'POST',
            body: {
                user_id: state.currentUserId,
                date: state.currentDate,
                title,
            },
        });

        els.taskInput.value = '';
        hideFeedback();
        await loadTasks();
        showToast('任务已添加');
    });

    els.taskList.addEventListener('change', async (event) => {
        const target = event.target;
        if (!target.matches('input[type="checkbox"][data-id]')) {
            return;
        }

        const taskId = Number(target.dataset.id);
        const completed = target.checked;

        const data = await api(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            body: {
                user_id: state.currentUserId,
                completed,
            },
        });

        await loadTasks();
        showFeedback(data.feedback, data.tone);
        showToast(completed ? '完成打卡，做得好' : '状态已更新，慢慢来');
    });

    els.taskList.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-delete-id]');
        if (!button) {
            return;
        }

        const taskId = Number(button.dataset.deleteId);
        await api(`/api/tasks/${taskId}?user_id=${state.currentUserId}`, {
            method: 'DELETE',
        });

        hideFeedback();
        await loadTasks();
        showToast('任务已删除');
    });

    els.checkinBtn.addEventListener('click', async () => {
        const data = await api('/api/checkin', {
            method: 'POST',
            body: {
                user_id: state.currentUserId,
                date: state.currentDate,
            },
        });

        const summary = data.summary;
        const detail = `${summary.message}（已完成 ${summary.completed}/${summary.total}，待完成 ${summary.pending}）`;
        showFeedback(detail, summary.tone);
    });

    els.cloneBtn.addEventListener('click', async () => {
        const data = await api('/api/clone-to-next-day', {
            method: 'POST',
            body: {
                user_id: state.currentUserId,
                date: state.currentDate,
            },
        });

        showToast(data.message);
        if (state.currentDate === data.target_date) {
            await loadTasks();
        }
    });
}

async function loadTasks() {
    if (!state.currentUserId || !state.currentDate) {
        return;
    }

    const data = await api(
        `/api/tasks?user_id=${state.currentUserId}&date=${encodeURIComponent(state.currentDate)}`
    );

    state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    renderTaskList();
}

function renderUserSwitch() {
    els.userSwitch.innerHTML = '';

    state.users.forEach((user) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'user-chip';
        button.textContent = user.name;

        if (user.id === state.currentUserId) {
            button.classList.add('active');
        }

        button.addEventListener('click', async () => {
            if (state.currentUserId === user.id) {
                return;
            }

            state.currentUserId = user.id;
            localStorage.setItem('checkin_user_id', String(user.id));
            renderUserSwitch();
            hideFeedback();
            await loadTasks();
        });

        els.userSwitch.appendChild(button);
    });
}

function renderTaskList() {
    els.taskList.innerHTML = '';

    const total = state.tasks.length;
    const completed = state.tasks.filter((task) => task.completed).length;
    els.taskMeta.textContent = `${completed}/${total} 完成`;

    if (total === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = '这一天还没有任务，先添加一个小目标吧。';
        els.taskList.appendChild(empty);
        return;
    }

    state.tasks.forEach((task) => {
        const item = document.createElement('div');
        item.className = 'task-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.dataset.id = String(task.id);

        const title = document.createElement('p');
        title.className = 'task-title';
        if (task.completed) {
            title.classList.add('done');
        }
        title.textContent = task.title;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'task-delete';
        deleteBtn.textContent = '删除';
        deleteBtn.dataset.deleteId = String(task.id);

        item.appendChild(checkbox);
        item.appendChild(title);
        item.appendChild(deleteBtn);

        els.taskList.appendChild(item);
    });
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
    els.feedbackCard.hidden = true;
    els.feedbackText.textContent = '';
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

function offsetDate(isoDate, offsetDays) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const base = new Date(year, month - 1, day);
    base.setDate(base.getDate() + offsetDays);
    return formatLocalDate(base);
}

function formatLocalDate(dateValue) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function api(url, options = {}) {
    const fetchOptions = {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (options.body !== undefined) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let data = {};

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error('服务返回了非 JSON 数据');
        }
    }

    if (!response.ok) {
        throw new Error(data.error || '请求失败');
    }

    return data;
}
