let smiElement;
let dayjs;
let debounce;

const externalScripts = ['https://unpkg.com/cally'];

const bootstrap = el => {
  smiElement = el;
  dayjs = window.og.smi.dayjs;
  debounce = window.og.smi.debounce;
  defineCustomElements();
};

const maxDate = ((window.og || {}).smi || {}).dayjs().add(120, 'days').format('YYYY-MM-DD');

const minDate = ((window.og || {}).smi || {}).dayjs().add(0, 'days').format('YYYY-MM-DD');

var cancelConfirmationTexts = {
  '2 | I have too many of this product': 'Overstocked? Not a problem, delay your shipment to get <strong>#productName#</strong> when you are ready!',
  '7 | I did not receive my order as expected': 'Are you sure you want to cancel? We always want you to be 100% satisfied with each and every purchase—if you don’t like a product, we’ll help you find a better solution.',
  '8 | This product is too expensive': 'Are you sure you want to cancel? Subscribing with GNC Routines gets you 10% off every order, free shipping, and more.',
  '12 | This product is out of stock': 'Are you sure you want to cancel? We’re currently out of stock—but stay tuned and we’ll let you know when it’s back.',
  '13 | I did not intend to join a subscription program': 'Are you sure you want to cancel? Subscribing with GNC Routines gets you 10% off every order, free shipping, and more.',
  '1': 'Are you sure you want to cancel? Let us know how we can improve your experience and let’s find a solution that’s right for you.'
};

var cancelConfirmationFirstButtons = {
  '2 | I have too many of this product': 'DELAY SHIPMENT',
  '7 | I did not receive my order as expected': 'LEARN MORE',
  '8 | This product is too expensive': 'GO BACK',
  '12 | This product is out of stock': 'DELAY SHIPMENT',
  '13 | I did not intend to join a subscription program': 'CONTINUE SHOPPING',
  '1': 'PROVIDE FEEDBACK'
};

var cancelConfirmationBtnUrls = {
  'DELAY SHIPMENT':'changeshipment',
  'LEARN MORE':'https://www.gnc.com/about-gnc/30-day-guarantee.html',
  'GO BACK':'goback',
  'CONTINUE SHOPPING':'https://www.gnc.com/shop-gnc-routines',
  'PROVIDE FEEDBACK':'verintform'
};

const handleSmiReady = () => {
  const targetElement = document.querySelector('#og-msi, og-smi');
  if (targetElement) {
    bootstrap(targetElement);
  } else {
    document.addEventListener('og:smi:ready', ev => {
      bootstrap(ev.target);
    });
  }
  document.addEventListener('og:smi:ready', ev => {
    loadOrderCarousels();
  });
};

const createScript = src => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = src;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
};

const bootstrapSmiWithScripts = async scripts => {
  try {
    await Promise.all(scripts.map(src => createScript(src)));
  } catch (error) {
    console.error(`Error loading external script for Ordergroove SM: ${error}`);
  } finally {
    handleSmiReady();
  }
};

bootstrapSmiWithScripts(externalScripts);


/* notification animation code */
// display notifications for 7 seconds by default
// the recommendation for accessibility is 5 seconds + 1 for every 120 words, and we do not expect more than 120 words to be in a notification
const NOTIFICATION_HIDE_DELAY = 7000;
class SMNotifications extends HTMLElement {
  static hideClosestNotification(event) {
    const notification = event.target.closest('.og-notification');
    if (notification) {
      SMNotifications._hideNotification(notification);
    }
  }

  static _hideNotification(notification) {
    if (notification.dataset.visibility) return; // notification already animated out
    notification.dataset.visibility = 'hidden';
    notification.dataset.animatingOut = true;
    waitForAnimationToEnd(notification, 200).then(() => {
      delete notification.dataset.animatingOut;
    });
  }

  connectedCallback() {
    this.observeNotifications();
  }

  observeNotifications() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(({ addedNodes }) => this.handleAddedNodes(addedNodes));
    });

    observer.observe(this, { childList: true, subtree: true });
  }

  

  handleAddedNodes(addedNodes) {
    addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('og-notification')) {
        this.hideNotificationAfterDelay(node);
      }
    });
  }

  async hideNotificationAfterDelay(notification) {
    await waitForDelay(NOTIFICATION_HIDE_DELAY);
    SMNotifications._hideNotification(notification);
  }
}

/* dialog interactivity code */
class SMDialog extends HTMLElement {
  static open(idOrEvent) {
    let dialogId;
    if (idOrEvent instanceof Event) {
      dialogId = idOrEvent.currentTarget.dataset.clickTarget;
    } else {
      dialogId = idOrEvent;
    }
    let dialog = smiElement.querySelector(`#${dialogId}`);
    dialog.showModal(idOrEvent?.currentTarget);
  }

  static close(e, dialogId) {
    let dialog;
    if (dialogId) {
      dialog = smiElement.querySelector(`#${dialogId}`);
    } else {
      dialog = e.target.closest('sm-dialog');
    }

    dialog.close();
  }

  constructor() {
    super();
    this.handleClick = this.handleClick.bind(this);
    this.manageFocus = this.manageFocus.bind(this);
  }

  connectedCallback() {
    this.dialog = this.querySelector('dialog');
    this.addEventListener('click', this.handleClick);
    this.dialog.addEventListener('close', this.manageFocus);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
    this.dialog.removeEventListener('close', this.manageFocus);
  }

  handleClick({ target }) {
    // close the dialog when the backdrop is clicked
    if (target.nodeName === 'DIALOG') {
      this.close();
    }
  }

  showModal(opener = null) {
    this.opener = opener;
    this.dialog.showModal();
  }

  close() {
    let dialog = this.dialog;
    let animationDuration = getComputedStyle(dialog).animationDuration;
    if (animationDuration && animationDuration !== '0s') {
      // dialogs go to display: none when closed, so we have to wait for the animation to finish
      dialog.dataset.animatingOut = true;
      waitForAnimationToEnd(dialog, 300).then(() => {
        delete dialog.dataset.animatingOut;
        dialog.close();
      });
    } else {
      dialog.close();
    }
  }

  manageFocus() {
    if (!this.opener) return;
    // normally the native <dialog> returns focus to the trigger element for us
    // however, if the element that opened the dialog was inside a dropdown, the dropdown is now closed and the element inside cannot be focused
    // detect this case and manually focus the trigger instead
    let dropdown = this.opener.closest('sm-dropdown');
    if (dropdown && dropdown.trigger) {
      dropdown.trigger.focus();
    }
  }
}

const DROPDOWN_EVENTS = {
  TRIGGER_CLICK: 'TRIGGER_CLICK',
  NEXT_MENU_ITEM: 'NEXT_MENU_ITEM',
  PREV_MENU_ITEM: 'PREV_MENU_ITEM',
  ITEM_CLICK: 'ITEM_CLICK',
  ESC_PRESS: 'ESC_PRESS',
  OUTSIDE_CLICK: 'OUTSIDE_CLICK',
  FOCUS_LEAVES_MENU: 'FOCUS_LEAVES_MENU'
};

class SMDropdown extends HTMLElement {
  connectedCallback() {
    this.state = {
      open: false,
      activeIndex: 0
    };

    this.trigger = this.querySelector('[aria-haspopup]');
    this.content = this.querySelector('[role="menu"]');
    this.actions = Array.from(this.content.querySelectorAll('[data-action]'));

    this.trigger.setAttribute('aria-expanded', false);
    this.actions.forEach(action => {
      action.tabIndex = -1;
    });

    this.setUpEventListeners();
  }

  setUpEventListeners() {
    this.triggerListener = e => this.handleEvent(DROPDOWN_EVENTS.TRIGGER_CLICK);
    this.actionListener = e => this.handleEvent(DROPDOWN_EVENTS.ITEM_CLICK);

    this.trigger.addEventListener('click', this.triggerListener);
    this.actions.forEach(el => el.addEventListener('click', this.actionListener));
    this.addEventListener('keydown', e => this.handleKeydown(e));
    this.addEventListener('focusout', e => this.handleFocusOut(e));

    // keep reference to remove later
    this.documentListener = e => this.handleOutsideClick(e);
    document.addEventListener('click', this.documentListener);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.documentListener);
    this.trigger.removeEventListener('click', this.triggerListener);
    this.actions.forEach(el => el.removeEventListener('click', this.actionListener));
  }

  handleEvent(type) {
    switch (type) {
      case DROPDOWN_EVENTS.TRIGGER_CLICK:
        this.state.open = !this.state.open;
        this.state.activeIndex = 0;
        break;
      case DROPDOWN_EVENTS.ITEM_CLICK:
      case DROPDOWN_EVENTS.ESC_PRESS:
      case DROPDOWN_EVENTS.OUTSIDE_CLICK:
      case DROPDOWN_EVENTS.FOCUS_LEAVES_MENU:
        this.state.open = false;
        this.state.activeIndex = 0;
        break;
      case DROPDOWN_EVENTS.NEXT_MENU_ITEM:
        this.state.activeIndex = (this.state.activeIndex + 1) % this.actions.length;
        break;
      case DROPDOWN_EVENTS.PREV_MENU_ITEM:
        this.state.activeIndex = (this.state.activeIndex + this.actions.length - 1) % this.actions.length;
        break;
    }

    // wait before performing side effects
    // this prevents an issue in iOS 16 where the dropdown closed too early, so clicks on the actions didn't register
    setTimeout(() => this.performSideEffects(type), 0);
  }

  performSideEffects(type) {
    this.trigger.setAttribute('aria-expanded', this.state.open);

    switch (type) {
      case DROPDOWN_EVENTS.TRIGGER_CLICK:
        if (this.state.open) {
          this.actions[this.state.activeIndex].focus();
        }
        break;
      case DROPDOWN_EVENTS.ESC_PRESS:
        this.trigger.focus();
        break;
      case DROPDOWN_EVENTS.NEXT_MENU_ITEM:
      case DROPDOWN_EVENTS.PREV_MENU_ITEM:
        this.actions[this.state.activeIndex].focus();
        break;
    }
  }

  handleOutsideClick(e) {
    if (this.state.open && !e.composedPath().includes(this)) {
      this.handleEvent(DROPDOWN_EVENTS.OUTSIDE_CLICK);
    }
  }

  handleFocusOut(e) {
    if (!this.contains(e.relatedTarget)) {
      this.handleEvent(DROPDOWN_EVENTS.FOCUS_LEAVES_MENU);
    }
  }

  handleKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        this.handleEvent(this.state.open ? DROPDOWN_EVENTS.NEXT_MENU_ITEM : DROPDOWN_EVENTS.TRIGGER_CLICK);
        e.preventDefault();
        break;
      case 'ArrowUp':
        this.handleEvent(DROPDOWN_EVENTS.PREV_MENU_ITEM);
        e.preventDefault();
        break;
      case 'Escape':
        this.handleEvent(DROPDOWN_EVENTS.ESC_PRESS);
        break;
    }
  }
}

class SMToggle extends HTMLElement {
  connectedCallback() {
    const triggers = Array.from(this.querySelectorAll('[data-toggle-trigger]'));

    this.content = this.querySelector('[data-toggle-content]');
    // the trigger can't be inside the content; otherwise there is no way to reveal the content
    this.trigger = triggers.find(t => !this.content.contains(t));
    if (!this.trigger) return;

    this.isOpen = 'open' in this.dataset;

    this.syncState();

    this.triggerListener = () => this.handleClick();
    this.trigger.addEventListener('click', this.triggerListener);
  }

  disconnectedCallback() {
    this.trigger.removeEventListener('click', this.triggerListener);
  }

  handleClick() {
    this.isOpen = !this.isOpen;
    this.animateContent();
    this.syncState();
  }

  syncState() {
    this.trigger.setAttribute('aria-expanded', this.isOpen);
    if (this.isOpen) {
      this.dataset.open = '';
    } else {
      delete this.dataset.open;
    }
  }

  animateContent() {
    this.dataset.animating = true;
    if (this.isOpen) {
      const newHeight = this.content.offsetHeight;
      this.content.style.height = 0;
      // we need to wait for the previous height to be applied to the DOM before updating it
      // otherwise the animation won't work
      runAfterPaint(() => {
        this.content.style.height = `${newHeight}px`;
      });
    } else {
      this.content.style.height = `${this.content.offsetHeight}px`;
      runAfterPaint(() => {
        this.content.style.height = 0;
      });
    }

    waitForAnimationToEnd(this.content, 400, 'transitionend').then(() => {
      delete this.dataset.animating;
      this.content.style.height = null;
    });
  }
}

class SMDatepicker extends HTMLElement {
  constructor() {
    super();
    this.bindMethods();
  }

  bindMethods() {
    this.togglePopover = this.togglePopover.bind(this);
    this.hidePopover = this.hidePopover.bind(this);
    this.save = this.save.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.stopPropagation = this.stopPropagation.bind(this);
    this.handleTriggerClick = this.handleTriggerClick.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.updateLocale = this.updateLocale.bind(this);
    this.reflectDate = this.reflectDate.bind(this);
  }

  initializeElements() {
    this.datepickerPopover = this.querySelector('[data-datepicker-popover]');
    this.trigger = this.querySelector('[data-datepicker-trigger]');
    this.calendar = this.querySelector('calendar-date');
    this.dateInput = this.querySelector('[data-datepicker-input]');
    this.cancelButton = this.querySelector('[data-datepicker-cancel]');
    this.saveButton = this.querySelector('[data-datepicker-save]');
    this.reflectDateContainers = this.querySelectorAll('[data-reflect-date]');
  }

  initializeProperties() {
    this.submitOnSave = this.getAttribute('data-submit-on-save') === 'true';
    this.minDateOffset = parseInt(this.getAttribute('data-min-date-offset-days')) || 1;
    this.minDate = this.getMinDate();
    this.selectedDate = this.dateInput && this.dateInput.value ? dayjs(this.dateInput.value) : this.minDate;
  }

  connectedCallback() {
    this.initializeElements();
    this.initializeProperties();
    this.addListeners();
    this.initializeCalendar();
    this.updateLocale();
    this.observeLangAttribute();
  }

  disconnectedCallback() {
    this.removeListeners();
    if (this.langObserver) {
      this.langObserver.disconnect();
    }
  }

  addListeners() {
    this.modifyListeners('addEventListener');
  }

  removeListeners() {
    this.modifyListeners('removeEventListener');
  }

  modifyListeners(action) {
    document[action]('click', this.handleOutsideClick);
    document[action]('keydown', this.handleKeydown);

    if (this.datepickerPopover) {
      this.datepickerPopover[action]('click', this.stopPropagation);
    }

    if (this.trigger) {
      this.trigger[action]('click', this.handleTriggerClick);
    }

    if (this.cancelButton) {
      this.cancelButton[action]('click', this.hidePopover);
    }

    if (this.saveButton) {
      this.saveButton[action]('click', this.save);
    }
  }

  handleTriggerClick(event) {
    event.preventDefault();
    event.stopPropagation();
    this.togglePopover();
  }

  stopPropagation(event) {
    event.stopPropagation();
  }

  initializeCalendar() {
    this.updateCalendarLocale();
    this.updateCalendarMin();
    this.updateCalendarValue();
  }

  getMinDate() {
    return dayjs().add(this.minDateOffset, 'day');
  }

  updateCalendarLocale() {
    this.calendar.setAttribute('locale', this.locale);
  }

  updateCalendarMin() {
    this.calendar.setAttribute('min', this.minDate.format('YYYY-MM-DD'));
  }

  updateCalendarValue() {
    this.calendar.setAttribute('value', this.selectedDate.format('YYYY-MM-DD'));
  }

  togglePopover() {
    const isVisible = this.datepickerPopover.getAttribute('data-visibility') === 'hidden';

    if (isVisible) {
      this.closeAllDatepickers();
    }

    this.datepickerPopover.setAttribute('data-visibility', isVisible ? 'visible' : 'hidden');
    this.trigger.setAttribute('aria-expanded', isVisible ? 'true' : 'false');
  }

  closeAllDatepickers() {
    const datepickers = document.querySelectorAll('sm-datepicker');
    datepickers.forEach(datepicker => {
      if (datepicker !== this) {
        datepicker.hidePopover();
      }
    });
  }

  hidePopover() {
    this.datepickerPopover.setAttribute('data-visibility', 'hidden');
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  save() {
    this.selectedDate = dayjs(this.calendar.value);
    this.hidePopover();

    if (!this.dateInput || !(this.dateInput instanceof HTMLInputElement)) {
      console.error('Date input not found');
      return;
    }

    this.dateInput.value = this.selectedDate.format('YYYY-MM-DD');
    this.reflectDate();

    if (this.submitOnSave) {
      const form = this.closest('form');
      if (form) {
        form.requestSubmit();
      } else {
        console.error('Form element not found');
      }
    }
  }

  handleOutsideClick(event) {
    if (!this.contains(event.target)) {
      this.hidePopover();
    }
  }

  handleKeydown(event) {
    if (event.key === 'Escape') {
      this.hidePopover();
    }
  }

  formatDate(value, format) {
    return value
      ? dayjs(value)
          .locale(this.locale)
          .format(format || 'LL')
      : '';
  }

  reflectDate() {
    const formattedDate = this.formatDate(this.selectedDate);

    this.reflectDateContainers.forEach(element => {
      const textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);

      if (textNode) {
        textNode.textContent = formattedDate;
      } else {
        element.appendChild(document.createTextNode(formattedDate));
      }
    });
  }

  updateLocale() {
    this.locale = document.documentElement.lang || 'en';
    this.updateCalendarLocale();
    this.reflectDate();
  }

  observeLangAttribute() {
    this.langObserver = new MutationObserver(this.updateLocale);

    this.langObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    });
  }
}

const countriesDataPromise = fetch(
  'https://static.ordergroove.com/@ordergroove/i18n-data/latest/i18n_country_data.json'
).then(res => res.json());

function createOption(value, text, parent) {
  const option = document.createElement('option');
  option.value = value;
  option.innerText = text;
  parent.appendChild(option);
  return option;
}

class CountryStateDropdown extends HTMLElement {
  constructor() {
    super();
    this.countrySelect = this.querySelector('[name="country_code"]');
    this.stateSelect = this.querySelector('[name="state_province_code"]');
  }

  connectedCallback() {
    this.syncCountryAndStates = this.syncCountryAndStates.bind(this);
    this.addCountryOptions = this.addCountryOptions.bind(this);
    this.setUpStateAndCountry = this.setUpStateAndCountry.bind(this);
    this.addSelectedOption = this.addSelectedOption.bind(this);
    this.updateStates = this.updateStates.bind(this);
    this.countryDefaultValue = this.countrySelect.getAttribute('value');
    this.stateDefaultValue = this.stateSelect.getAttribute('value');

    this.setUpStateAndCountry();

    this.countrySelect.addEventListener('change', this.updateStates);
  }

  disconnectedCallback() {
    this.countrySelect.removeEventListener('change', this.updateStates);
  }

  async setUpStateAndCountry() {
    const countriesByCode = await countriesDataPromise;
    this.addCountryOptions(countriesByCode);
    this.syncCountryAndStates(this.countryDefaultValue);
    if (this.countryDefaultValue) this.addSelectedOption(this.countryDefaultValue, this.countrySelect);
    if (this.stateDefaultValue) this.addSelectedOption(this.stateDefaultValue, this.stateSelect);
  }

  async addCountryOptions(countriesByCode) {
    const enabledCountries = Object.entries(countriesByCode)
      .filter(([code]) => this.enabledCountries.includes(code))
      .sort((a, b) => (a[1].name > b[1].name ? 1 : -1));
    enabledCountries.forEach(([code, countryInfo]) => {
      const option = createOption(code, this.localizedCountries[code] || countryInfo.name, this.countrySelect);
      if (code === this.countryDefaultValue) option.selected = true;
    });
  }

  async syncCountryAndStates(countryValue) {
    const countriesByCode = await countriesDataPromise;
    const selectedCountry = countriesByCode[countryValue];
    const states = selectedCountry ? selectedCountry.regions : null;

    const currentOptions = this.stateSelect.querySelectorAll('option');
    currentOptions.forEach(option => {
      // Clear all options except default blank option
      if (option.value !== '') option.remove();
    });

    if (states && states.length) {
      states.forEach(({ code, name }) => {
        const option = createOption(code, name, this.stateSelect);
        if (code === this.stateDefaultValue) option.selected = true;
      });
    }
  }

  async addSelectedOption(selectedValue, selectElement) {
    // get all options from select Element
    const options = selectElement.querySelectorAll('option');
    // find the option with the selected value
    const selectedOption = Array.from(options).find(option => option.value === selectedValue);
    // if selectedOption is not found, create it
    if (!selectedOption && selectedValue) {
      createOption(selectedValue, selectedValue, selectElement);
    }
    if (selectElement.querySelectorAll('option').length === 0) {
      selectElement.style.visibility = 'hidden';
    }
  }

  async updateStates(event) {
    await this.syncCountryAndStates(event.target.value);
  }
}

class SMMultiStep extends HTMLElement {
  constructor() {
    super();
    this.handleStepChange = this.handleStepChange.bind(this);
    this.resetCurrentStep = this.resetCurrentStep.bind(this);
  }

  connectedCallback() {
    this.addEventListener('og-step-change', this.handleStepChange);
    this.addEventListener('og-step-reset', this.resetCurrentStep);
    this.resetCurrentStep();
  }

  disconnectedCallback() {
    this.removeEventListener('og-step-change', this.handleStepChange);
    this.removeEventListener('og-step-reset', this.resetCurrentStep);
  }

  setCurrentStep(step) {
    // the CSS uses a data-active attribute to only show the active step
    delete this.currentStep?.dataset.active;
    this.currentStep = step;
    if (this.currentStep) {
      this.currentStep.dataset.active = '';
    }
  }

  handleStepChange({ detail }) {
    this.setCurrentStep(this.querySelector(`[data-step="${detail.step}"]`));
  }

  resetCurrentStep() {
    const firstStep = this.querySelector('[data-step]');
    this.setCurrentStep(firstStep);
  }
}

class SMProductFilter extends HTMLElement {
  constructor() {
    super();
    this.handleSearchInput = debounce(this.handleSearchInput.bind(this), 150);
    this.clearSearchInput = this.clearSearchInput.bind(this);
    this.heightLocked = false;
  }

  connectedCallback() {
    this.searchInput = this.querySelector('[data-search-input]');
    this.clearButton = this.querySelector('[data-clear-button]');
    this.items = this.querySelector('[data-items]');
    this.noResults = this.querySelector('[data-no-results]');

    this.searchInput.addEventListener('input', this.handleSearchInput);
    this.clearButton.addEventListener('click', this.clearSearchInput);
  }

  disconnectedCallback() {
    this.searchInput.removeEventListener('input', this.handleSearchInput);
    this.clearButton.removeEventListener('click', this.clearSearchInput);
  }

  handleSearchInput(e) {
    // when the user searches, set the height of the items container so items don't jump around
    if (!this.heightLocked) {
      this.items.style.height = getComputedStyle(this.items).height;
      this.heightLocked = true;
    }
    const searchValue = e.target.value.toLowerCase();
    this.displayMatchingItems(searchValue);
  }

  clearSearchInput() {
    this.searchInput.value = '';
    this.searchInput.focus();
    this.displayMatchingItems('');
  }

  displayMatchingItems(searchText) {
    let matchingItems = 0;
    const items = this.querySelectorAll(`[data-product-name]`);
    items.forEach(item => {
      const itemValue = item.dataset.productName.toLowerCase();
      if (itemValue.includes(searchText)) {
        matchingItems++;
        item.style.display = null;
      } else {
        item.style.display = 'none';
        // if the product was selected, de-select it since we're hiding it
        if (item.control.checked) {
          item.control.checked = false;
          // manually dispatch a change event so the form submit button is disabled
          item.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    // hide or show the "no results" message
    if (matchingItems === 0) {
      this.noResults.style.display = 'block';
    } else {
      this.noResults.style.display = null;
    }
  }
}

function defineCustomElements() {
  const smCustomElements = {
    'sm-notifications': SMNotifications,
    'sm-dialog': SMDialog,
    'sm-dropdown': SMDropdown,
    'sm-toggle': SMToggle,
    'sm-datepicker': SMDatepicker,
    'sm-country-state-dropdown': CountryStateDropdown,
    'sm-multistep': SMMultiStep,
    'sm-product-filter': SMProductFilter
  };

  for (const tagName of Object.keys(smCustomElements)) {
    if (!customElements.get(tagName)) {
      customElements.define(tagName, smCustomElements[tagName]);
    }
  }
}

/* utilities */

/**
 * Returns a Promise that resolves when an animation finishes playing.
 * If the animation takes longer than `maxDuration`, the Promise will also resolve.
 */
function waitForAnimationToEnd(element, maxDuration, event = 'animationend') {
  return Promise.race([waitForEvent(element, event, { once: true }), waitForDelay(maxDuration)]);
}

function waitForEvent(target, eventName, eventOptions = {}) {
  return new Promise(resolve => {
    target.addEventListener(eventName, resolve, eventOptions);
  });
}

function waitForDelay(duration) {
  return new Promise(resolve => {
    setTimeout(resolve, duration);
  });
}

// gets the next order date for a subscription
function nthOrderDate(order, subscription, n = 1) {
  const increment = subscription.every * n;
  const unit = {
    1: 'day',
    2: 'week',
    3: 'month'
  }[subscription.every_period];

  const dayjs = ((window.og || {}).smi || {}).dayjs;

  return typeof dayjs === 'function' ? dayjs(order.place).add(increment, unit) : null;
}

function runAfterPaint(cb) {
  requestAnimationFrame(() => {
    setTimeout(cb);
  });
}

function disableFormElements(ev) {
  ev.target.querySelectorAll('select,input,button').forEach(it => it.toggleAttribute('disabled', true));
}

function enableFormElements(ev) {
  ev.target.querySelectorAll('select,input,button').forEach(it => it.toggleAttribute('disabled', false));
}

function submitFormOnchange(ev) {
  ev.target.closest('form').requestSubmit();
}

function dispatchOGEvent(event, name, detail) {
  event.currentTarget.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

function getFormAction(ev) {
  const form = ev.target.closest('form');
  
  const skipShipmentRadio = form.getElementsByClassName('og-skip-shipment-radio')[0];
  
  if (skipShipmentRadio.checked) {
      form.setAttribute('data-og-action-key', 'skip_shipment');
  }
}

function changeSubmitButtonText(ev) {
  const form = ev.target.closest('form');
  
  const skipShipmentRadio = form.getElementsByClassName('og-skip-shipment-radio')[0];
  const submitButton = form.getElementsByClassName('og-change-date-skip-button')[0];
  
  if (skipShipmentRadio.checked) {
      submitButton.innerHTML = 'YES, SKIP THIS SHIPMENT';
  } else {
      submitButton.innerHTML = 'APPLY CHANGES';
  }
}

function changeDateHandler(ev) {
  const form = ev.target.closest('form');
  const selectedDate = ((window.og || {}).smi || {}).dayjs(ev.target.value).format('YYYY-MM-DD');
  const cutoffDate = ((window.og || {}).smi || {}).dayjs().add(4, 'days').format('YYYY-MM-DD');
  const changeDateMessage = form.querySelector('#change-date-message'); 
  const dialogBodyElement = form.querySelector('.og-change-shipment-date-button .og-dialog-body');

  if (selectedDate < cutoffDate) {
    changeDateMessage.style.display = 'flex';
    dialogBodyElement.classList.add('auto-height');
  } else {
    changeDateMessage.style.display = 'none'; 
    dialogBodyElement.classList.remove('auto-height');
  }
}

function closeChangeDateModal(ev) {
  const form = ev.target.closest('form');
  const changeDateMessage = form.querySelector('#change-date-message'); 
  const dialogBodyElement = form.querySelector('.og-change-shipment-date-button .og-dialog-body');
  changeDateMessage.style.display = 'none'; 
  dialogBodyElement.classList.remove('auto-height');
  const smDialogElement = form.closest('sm-dialog');
  if (smDialogElement) {
    SMDialog.close(ev, smDialogElement.id);
  }
}

function reset_cancel_divs(ev) {
  const smDialogElement = ev.target.closest('sm-dialog');
  if (smDialogElement) {
    SMDialog.close(ev, smDialogElement.id);
  }
  const dialog = ev.target.closest('dialog');
  if (dialog) {
    const divSkipOrder = dialog.querySelector('.og-cancel-subscription-skip');
    const divCancelReasons = dialog.querySelector('.og-cancel-subscription-select-reasons');
    const divConfirmCancel = dialog.querySelector('.og-cancel-subscription-confirm-cancel');
    const cancelReasonRadios = dialog.querySelectorAll('.og-cancel-reason-radio');
    const reasonsTextarea = dialog.querySelector('.other-cancel-reason');
    cancelReasonRadios.forEach(radio => {
          radio.checked = false;
    });
    divConfirmCancel.hidden = true;
    divSkipOrder.hidden = false;
    divCancelReasons.hidden = true;
    reasonsTextarea.hidden = true;
    reasonsTextarea.value = '';
  }
}

function checkPastSubscriptionsHasProducts (){
  document.querySelectorAll('.og-container section').forEach(function(section) {
    // Check if the section is empty (no text content)
    if (section.textContent.trim() === '') {
      // Hide the section by setting its display property to "none"
      section.style.display = 'none';
    } else {
        section.style.display = 'block';
    }
  });
}

function show_cancel_success(ev) {
  SMDialog.open('cancelled-dialog');
}

function open_skip_delivery(ev) {
  const contentWrapper = ev.target.closest('.og-content-wrapper');
  if (contentWrapper) {
    const button = contentWrapper.querySelector('.og-change-shipment-date-button button');
    const resetButton = document.querySelector('.og-cancel-subscription-skip button[type="reset"]');
    resetButton.click();
    button.click();
  }
}

function goBack(e) {
  const cancelConfirmElement = e.target.closest('.og-cancel-subscription-confirm-cancel');
  if (cancelConfirmElement) {
    const resetButton = cancelConfirmElement.querySelector('button[type="reset"]');
    resetButton.click();
  }
}

function show_cancel_reasons(ev) {
  const dialog = ev.target.closest('dialog');
  const divSkipOrder = dialog.querySelector('.og-cancel-subscription-skip');
  divSkipOrder.hidden = true;
  const divCancelReasons = dialog.querySelector('.og-cancel-subscription-select-reasons');
  divCancelReasons.hidden = false;
  const radiosCanselReason = divCancelReasons.querySelectorAll('input[type="radio"]')
  if (radiosCanselReason) {
      radiosCanselReason.forEach(function(radio) {
        radio.checked = false;
    });
  }
  document.querySelector('.og-cancel-continue-btn').disabled = true;
  document.querySelector('.other-cancel-reason').hidden = true;
}

function enable_continue_btn(e) {
  e.target.closest('dialog').querySelector('.og-cancel-continue-btn').disabled = false;
  e.target.closest('dialog').querySelector('.other-cancel-reason').hidden = true;
  e.target.closest('dialog').querySelector('.other-cancel-reason').onkeyup = null;
}

function check_reasons_text_area(e) {
  const reasonsTextarea = e.target.closest('dialog').querySelector('.other-cancel-reason');
  if (reasonsTextarea.value.length > 0) {
          e.target.closest('dialog').querySelector('.og-cancel-continue-btn').disabled = false;
  } else {
          e.target.closest('dialog').querySelector('.og-cancel-continue-btn').disabled = true;
  }
}

function enable_text_area(e) {
  e.target.closest('dialog').querySelector('.other-cancel-reason').hidden = false;
  check_reasons_text_area(e);
  e.target.closest('dialog').querySelector('.other-cancel-reason').onkeyup = null;
  e.target.closest('dialog').querySelector('.other-cancel-reason').onkeyup = (e) => check_reasons_text_area(e);
}

function appendSecondaryBtn(dialog, text, url, ev) {
  if(document.querySelector('a.og-custom-element')!=null) {
      document.querySelector('a.og-custom-element').remove();
  }
  if(document.querySelector('button.og-custom-element')!=null) {
      document.querySelector('button.og-custom-element').remove();
  }
  
  var link = document.createElement('a');
  link.href = url;
  link.textContent = text;
  link.classList.add('og-custom-element');

  var form = ev.target ? ev.target.closest('.og-cancel-subscription-button') : null;
  var ogSubscriptionCancel = form ? form.querySelector('form[name="og_subscription_cancel"]') : null;
  var subscriptionHealthMembership = ogSubscriptionCancel ? ogSubscriptionCancel.querySelector('#subscription_health_membership') : null;
  if (subscriptionHealthMembership && subscriptionHealthMembership.value == 'true') {
    if (link.href.indexOf('changeshipment') > -1) {
      link.classList.add('disabled');
      link.style.pointerEvents = 'none'; // Prevent clicks
      link.style.opacity = '0.5'; // Grey out the button
    }
  }

  link.onclick = function(e) {
      if(this.href.indexOf('changeshipment')>-1) {
          e.preventDefault();
          open_skip_delivery(e);
      } 
      if(this.href.indexOf('goback')>-1) {
          e.preventDefault();
          goBack(e);
      }
      if(this.href.indexOf('verintform')>-1) {
           e.preventDefault();
          document.querySelector('.og-cancel-subscription-confirm-cancel button[type="reset"]').click();
          document.querySelector('#feedback_oo a').click();
      }
  }
  
  dialog.querySelector('.og-cancel-subscription-confirm-cancel button[name="cancel_subscription"]').before(link);
}


function show_confirm_cancellation_popup(ev, productName) {
  const dialog = ev.target.closest('dialog');
  var divCancelHelpText = dialog.querySelector('.og-cancel-helptext span');
  var cancelKey = document.querySelector('form[name="og_subscription_cancel"] input[name="cancel_reason"]:checked').value;
  var cancelHelpTextValue = cancelConfirmationTexts[cancelKey];
  cancelHelpTextValue = cancelHelpTextValue.replace('#productName#', window.pname);
  divCancelHelpText.innerHTML = cancelHelpTextValue;
  
  var secondaryBtnText = cancelConfirmationFirstButtons[cancelKey];
  var secondaryBtnUrl = cancelConfirmationBtnUrls[secondaryBtnText];
  appendSecondaryBtn(dialog, secondaryBtnText, secondaryBtnUrl, ev);
  const divCancelReasons = dialog.querySelector('.og-cancel-subscription-select-reasons');
  divCancelReasons.hidden = true;
  const divConfirmCancel = dialog.querySelector('.og-cancel-subscription-confirm-cancel');
  divConfirmCancel.hidden = false;
  document.querySelector('.og-cancel-continue-btn').disabled = true;
}

function show_cancel_dialog(ev) {
  window.pname = ev.target.dataset.pname;
  var clickTarget = ev.target.dataset.clickTarget;
  SMDialog.open(clickTarget);
}

function disable_form_elements(ev) {
  ev.target.querySelectorAll('select,input,button').forEach(it => it.toggleAttribute('disabled', true));
}

function enable_form_elements(ev) {
  ev.target.querySelectorAll('select,input,button').forEach(it => it.toggleAttribute('disabled', false));
}

function submit_form_onchange(ev) {
  ev.target.closest('form').requestSubmit();
}

function nth_order_date(order, subscription, n = 1) {
  const increment = subscription.every * n;
  const unit = {
    '1': 'day',
    '2': 'week',
    '3': 'month'
  }[subscription.every_period];

  const dayjs = ((window.og || {}).smi || {}).dayjs;

  return typeof dayjs === 'function' ? dayjs(order.place).add(increment, unit) : null;
}

function lastDayForOrder(order){ 
  return new Date(Date.parse(order.place) - 3 * 86400 * 1000).toString().substring(3,10)
}

function loadOrderCarousels() {
  var $orderProductImages = $('.og-order-product-images');

  if ($orderProductImages.length) {
    $orderProductImages.each(function () {
      var $slider = $(this);
      var $thumbnails = $slider.find('.og-thumbnail');

      var thumbnailCount = $thumbnails.length;
      var windowWidth = $(window).width();

      if ($slider.hasClass('slick-initialized')) {
        $slider.slick('unslick');
      }

      if (
        (windowWidth > 768 && thumbnailCount > 4) ||
        (windowWidth <= 768 && thumbnailCount > 2)
      ) {
        $slider.slick({
          slidesToShow: 4,
          slidesToScroll: 1,
          fade: false,
          arrows: windowWidth > 1024,
          waitForAnimate: false,
          infinite: false,
          variableWidth: true,
          responsive: [
            {
              breakpoint: 1024,
              settings: {
                slidesToShow: 4,
                slidesToScroll: 3,
                arrows: false,
                infinite: false,
              },
            },
            {
              breakpoint: 768,
              settings: {
                slidesToShow: 2.5,
                slidesToScroll: 2,
                arrows: false,
                infinite: false,
              },
            },
          ],
        });
      }
    });
  }
}
