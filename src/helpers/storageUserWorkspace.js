import { getDefaultProjectEnums } from '../enums/default-project.enum';
import { LocalStorageService } from '../services/localStorage-service';
import { ProjectService } from '../services/project-service';
import { isOffline } from '../components/check-connection';
import locales from '../helpers/locales';

const localStorageService = new LocalStorageService();
const projectService = new ProjectService();

export class DefaultProject {
	constructor(defaultProject) {
		this.project = defaultProject.project;
		//  project {
		//      { id: LAST_USED_PROJECT }
		//      { id: 123, name: Kika }
		//      { id: 123, name: Kika, selectedTask: { id: 567, name: Tarzan } }
		//  }
		this.enabled = defaultProject.enabled;
	}

	static async getStorage(isPomodoro = false) {
		const storageName = isPomodoro
			? getDefaultProjectEnums().POMODORO_BREAK_DEFAULT_PROJECTS
			: getDefaultProjectEnums().DEFAULT_PROJECTS;

		const isPermanent = true;
		const workspaceId = await localStorageService.get('activeWorkspaceId');
		const userId = await localStorageService.get('userId');
		const str = await localStorageService.get(
			`${isPermanent ? 'permanent_' : ''}${storageName}`
		);

		const storage = new StorageUserWorkspace(
			storageName,
			{ workspaceId, userId, str },
			isPermanent
		);
		const defaultProject = storage.defaultProject;
		return { storage, defaultProject };
	}

	getProjectTaskIds() {
		return {
			projectId: this.project.id,
			taskId: this.project.selectedTask ? this.project.selectedTask.id : null,
		};
	}

	async _getProjectTask(forceTasks = false) {
		const { id, selectedTask } = this.project;
		if (id === getDefaultProjectEnums().LAST_USED_PROJECT) {
			return await this.getLastUsedProjectFromTimeEntries(forceTasks);
		} else {
			const projectDB = await this.getProjectsByIds([id]);
			let taskDB = null;
			if (projectDB) {
				if (!projectDB.archived && selectedTask) {
					taskDB = await this.getTask(selectedTask.id);
					if (taskDB) {
						taskDB.isDone = taskDB.status === 'DONE';
					}
				}
			}
			return { projectDB, taskDB };
		}
	}

	async getProjectTaskFromDB(forceTasks) {
		if (await isOffline())
			return { projectDB: null, taskDB: null, msg: null, msgId: null };
		let msg = null;
		let msgId = null;
		if (this.enabled) {
			let { projectDB, taskDB, notFound } = await this._getProjectTask(
				forceTasks
			);
			if (notFound) msgId = 'projectDoesNotExist';
			if (projectDB) {
				if (projectDB.archived) {
					// storage.removeDefaultProject();
					msg = `${locales.DEFAULT_PROJECT_ARCHIVED}. ${locales.YOU_CAN_SET_A_NEW_ONE_IN_SETTINGS}.`;
					msgId = 'projectArchived';
					projectDB = null;
				} else {
					if (forceTasks) {
						if (taskDB) {
							if (taskDB.isDone) {
								taskDB = null;
								msg = `${locales.DEFAULT_TASK_DONE}. ${locales.YOU_CAN_SET_A_NEW_ONE_IN_SETTINGS}.`;
								msgId = 'taskDone';
							}
						} else {
							msg = `${locales.DEFAULT_TASK_DOES_NOT_EXIST}. ${locales.YOU_CAN_SET_A_NEW_ONE_IN_SETTINGS}.`;
							msgId = 'taskDoesNotExist';
						}
					}
				}
				return { projectDB, taskDB, msg, msgId };
			} else {
				// storage.removeDefaultProject();
				msg = `${locales.DEFAULT_PROJECT_NOT_AVAILABLE} ${locales.YOU_CAN_SET_A_NEW_ONE_IN_SETTINGS}`;
				msgId = 'projectDoesNotExist';
			}
		}
		return { projectDB: null, taskDB: null, msg, msgId };
	}

	async getLastUsedProjectFromTimeEntries(forceTasks) {
		return projectService
			.getLastUsedProject(forceTasks)
			.then((response) => {
				if (response.data) {
					const { data } = response;
					return forceTasks
						? { projectDB: data.project, taskDB: data.task }
						: { projectDB: data, taskDB: null };
				} else {
					return { projectDB: null, taskDB: null };
				}
			})
			.catch(() => {
				return { projectDB: null, taskDB: null, notFound: true };
			});
	}

	async getProjectsByIds(projectIds) {
		return projectService
			.getProjectsByIds(projectIds)
			.then((response) => {
				if (response.data.length > 0) {
					return response.data[0];
				} else {
					return null;
				}
			})
			.catch(() => {
				return null;
			});
	}

	async getTask(taskId) {
		return projectService
			.getAllTasks([taskId])
			.then((response) => {
				if (response.data.length > 0) {
					return response.data[0];
				} else {
					return null;
				}
			})
			.catch((error) => {
				return null;
			});
	}
}

export class StorageUserWorkspace {
	constructor(
		storageName = getDefaultProjectEnums().DEFAULT_PROJECTS,
		storageItems,
		isPermanent = true
	) {
		this.storageName = storageName;
		this.isPermanent = isPermanent;

		this.workspaceId = storageItems.workspaceId;
		this.userId = storageItems.userId;
		const str = storageItems.str;

		// this.workspaceId = await localStorageService.get('activeWorkspaceId');
		// this.userId = await localStorageService.get('userId');

		// const str = await localStorageService.get(`${isPermanent ? 'permanent_' : ''}${storageName}`);
		let storage = str ? JSON.parse(str) : {};
		if (Array.isArray(storage)) {
			const obj = {};
			storage.map((item) => {
				const { userId, workspaceId, project, enabled } = item;
				let user = obj[userId];
				if (!user) {
					user = obj[userId] = {};
				}
				let workspace = user[workspaceId];
				if (!workspace) {
					workspace = user[workspaceId] = {};
				}
				workspace.defaultProject = {
					project: {
						id: project.id,
						name: project.name,
						selectedTask: project.selectedTask
							? {
									id: project.selectedTask.id,
									name: project.selectedTask.name,
							  }
							: null,
					},
					enabled,
				};
			});
			this.storage = obj;
			this.store();
		} else {
			this.storage = storage;
		}
	}

	get Workspace() {
		const storage = this.storage;
		let user = storage[this.userId];
		if (!user) {
			user = storage[this.userId] = {};
		}
		let workspace = user[this.workspaceId];
		if (!workspace) {
			workspace = user[this.workspaceId] = {};
		}
		return workspace;
	}

	get Storage() {
		return this.storage;
	}

	get defaultProject() {
		const workspace = this.Workspace;
		return workspace.defaultProject
			? new DefaultProject(workspace.defaultProject)
			: null;
	}

	setInitialDefaultProject() {
		let workspace = this.Workspace;
		workspace.defaultProject = {
			project: {
				id: getDefaultProjectEnums().LAST_USED_PROJECT,
				name: locales.LAST_USED_PROJECT,
			},
			enabled: true,
		};
		this.store();
		return workspace.defaultProject;
	}

	setDefaultProject(project) {
		let workspace = this.Workspace;
		workspace.defaultProject = {
			project: {
				id: project.id,
				name: project.name,
				selectedTask: project.selectedTask
					? {
							id: project.selectedTask.id,
							name: project.selectedTask.name,
					  }
					: null,
			},
			enabled: true,
		};
		this.store();
	}

	toggleEnabledOfDefaultProject() {
		const workspace = this.Workspace;
		const { defaultProject } = workspace;
		if (defaultProject) {
			defaultProject.enabled = !defaultProject.enabled;
			this.store();
		}
	}

	removeDefaultProject() {
		const workspace = this.Workspace;
		workspace.defaultProject = null;
	}

	store() {
		localStorageService.set(
			this.storageName,
			JSON.stringify(this.storage),
			this.isPermanent ? 'permanent_' : null
		);
	}
}
