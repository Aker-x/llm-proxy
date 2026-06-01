export function createAccountUi({
  elements,
}) {
  const {
    managedUserPassword,
    managedUsername,
    managedUserRole,
    userCancelEditButton,
    userEditUsername,
    userForm,
    userFormHint,
    userFormTitle,
    userSubmitButton,
  } = elements;

  function setFormMode({ titleElement, hintElement, cancelButton, submitButton, title, hint, isEditing }) {
    if (titleElement) {
      titleElement.textContent = title;
    }
    if (hintElement) {
      hintElement.textContent = hint;
    }
    if (cancelButton) {
      cancelButton.hidden = !isEditing;
    }
    if (submitButton) {
      const submitLabel = isEditing ? '\u4fdd\u5b58' : '\u65b0\u5efa';
      submitButton.textContent = submitLabel;
      if (Object.prototype.hasOwnProperty.call(submitButton.dataset, 'originalLabel')) {
        submitButton.dataset.originalLabel = submitLabel;
      }
    }
  }

  function setUserFormMode(isEditing = false) {
    setFormMode({
      titleElement: userFormTitle,
      hintElement: userFormHint,
      cancelButton: userCancelEditButton,
      submitButton: userSubmitButton,
      title: isEditing ? '\u7f16\u8f91\u8d26\u53f7' : '\u521b\u5efa\u8d26\u53f7',
      hint: isEditing
        ? '\u70b9\u4fdd\u5b58\u4f1a\u66f4\u65b0\u5f53\u524d\u8d26\u53f7\uff0c\u70b9\u53d6\u6d88\u7f16\u8f91\u5219\u56de\u5230\u65b0\u5efa\u72b6\u6001\u3002'
        : '\u9ed8\u8ba4\u4e3a\u65b0\u5efa\u72b6\u6001\uff0c\u76f4\u63a5\u70b9\u4fdd\u5b58\u5373\u4f1a\u521b\u5efa\u8d26\u53f7\u3002',
      isEditing,
    });
    if (managedUsername) {
      managedUsername.disabled = isEditing;
    }
    if (managedUserRole) {
      managedUserRole.disabled = isEditing;
    }
  }

  function resetUserForm() {
    if (userEditUsername) {
      userEditUsername.value = '';
    }
    if (managedUsername) {
      managedUsername.value = '';
    }
    if (managedUserRole) {
      managedUserRole.value = 'user';
    }
    if (managedUserPassword) {
      managedUserPassword.value = '';
    }
    setUserFormMode(false);
  }

  function editUser(user) {
    if (userEditUsername) {
      userEditUsername.value = user.username;
    }
    if (managedUsername) {
      managedUsername.value = user.username;
    }
    if (managedUserRole) {
      managedUserRole.value = user.role || 'user';
    }
    if (managedUserPassword) {
      managedUserPassword.value = '';
    }
    setUserFormMode(true);
    userForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    managedUserPassword?.focus();
  }

  return {
    editUser,
    resetUserForm,
  };
}
