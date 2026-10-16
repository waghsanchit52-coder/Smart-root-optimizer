#ifndef CUSTOM_DS_H
#define CUSTOM_DS_H

#include <string>
#include <stdexcept>

// ==========================================
// 1. CUSTOM VECTOR (Dynamic Array)
// ==========================================
template <typename T>
class CustomVector {
private:
    T* arr;
    int capacity;
    int current;

public:
    CustomVector() {
        capacity = 1;
        current = 0;
        arr = new T[capacity];
    }

    ~CustomVector() {
        delete[] arr;
    }

    // Copy Constructor
    CustomVector(const CustomVector& other) {
        capacity = other.capacity;
        current = other.current;
        arr = new T[capacity];
        for (int i = 0; i < current; i++) {
            arr[i] = other.arr[i];
        }
    }

    // Assignment Operator
    CustomVector& operator=(const CustomVector& other) {
        if (this != &other) {
            delete[] arr;
            capacity = other.capacity;
            current = other.current;
            arr = new T[capacity];
            for (int i = 0; i < current; i++) {
                arr[i] = other.arr[i];
            }
        }
        return *this;
    }

    void push_back(const T& data) {
        if (current == capacity) {
            T* temp = new T[capacity * 2];
            for (int i = 0; i < capacity; i++) {
                temp[i] = arr[i];
            }
            delete[] arr;
            capacity *= 2;
            arr = temp;
        }
        arr[current] = data;
        current++;
    }

    T& operator[](int index) {
        return arr[index];
    }
    
    const T& operator[](int index) const {
        return arr[index];
    }

    int size() const { return current; }
    
    void resize(int newSize, T defaultValue = T()) {
        T* temp = new T[newSize];
        for (int i = 0; i < newSize; i++) {
            if (i < current) temp[i] = arr[i];
            else temp[i] = defaultValue;
        }
        delete[] arr;
        capacity = newSize;
        current = newSize;
        arr = temp;
    }
    
    void reverse() {
        for (int i = 0; i < current / 2; i++) {
            T temp = arr[i];
            arr[i] = arr[current - 1 - i];
            arr[current - 1 - i] = temp;
        }
    }
};

// ==========================================
// 2. CUSTOM HASH MAP (Linked List Chaining)
// ==========================================
template <typename K, typename V>
struct HashNode {
    K key;
    V value;
    HashNode* next;
    HashNode(K k, V v) : key(k), value(v), next(nullptr) {}
};

template <typename K, typename V>
class CustomHashMap {
private:
    HashNode<K, V>** table;
    int capacity;
    int numElements;

    // Simple Hash Function for Strings and Ints
    int hashFunction(int key) const {
        return key % capacity;
    }

    int hashFunction(const std::string& key) const {
        unsigned long hash = 5381;
        for (char c : key) {
            hash = ((hash << 5) + hash) + c; 
        }
        return hash % capacity;
    }

public:
    CustomHashMap(int cap = 100) {
        capacity = cap;
        numElements = 0;
        table = new HashNode<K, V>*[capacity];
        for (int i = 0; i < capacity; i++) table[i] = nullptr;
    }

    ~CustomHashMap() {
        for (int i = 0; i < capacity; i++) {
            HashNode<K, V>* entry = table[i];
            while (entry != nullptr) {
                HashNode<K, V>* prev = entry;
                entry = entry->next;
                delete prev;
            }
        }
        delete[] table;
    }

    void insert(K key, V value) {
        int hashVal = hashFunction(key);
        HashNode<K, V>* prev = nullptr;
        HashNode<K, V>* entry = table[hashVal];

        while (entry != nullptr && entry->key != key) {
            prev = entry;
            entry = entry->next;
        }

        if (entry == nullptr) {
            entry = new HashNode<K, V>(key, value);
            if (prev == nullptr) table[hashVal] = entry;
            else prev->next = entry;
            numElements++;
        } else {
            entry->value = value;
        }
    }

    V& operator[](K key) {
        int hashVal = hashFunction(key);
        HashNode<K, V>* entry = table[hashVal];
        
        while (entry != nullptr) {
            if (entry->key == key) return entry->value;
            entry = entry->next;
        }
        // If not found, insert default
        insert(key, V());
        return operator[](key);
    }

    bool contains(K key) const {
        int hashVal = hashFunction(key);
        HashNode<K, V>* entry = table[hashVal];
        while (entry != nullptr) {
            if (entry->key == key) return true;
            entry = entry->next;
        }
        return false;
    }
    
    // Custom iterator to easily get keys (for our graph nodes)
    CustomVector<K> getKeys() const {
        CustomVector<K> keys;
        for (int i = 0; i < capacity; i++) {
            HashNode<K, V>* entry = table[i];
            while (entry != nullptr) {
                keys.push_back(entry->key);
                entry = entry->next;
            }
        }
        return keys;
    }
};


// ==========================================
// 3. CUSTOM MIN HEAP (Priority Queue)
// ==========================================
// Specifically designed for A* algorithm pairs: pair(fScore, nodeID)
struct HeapPair {
    double priority;
    int data;
};

class CustomMinHeap {
private:
    CustomVector<HeapPair> heap;

    int parent(int i) { return (i - 1) / 2; }
    int leftChild(int i) { return (2 * i) + 1; }
    int rightChild(int i) { return (2 * i) + 2; }

    void swap(HeapPair* x, HeapPair* y) {
        HeapPair temp = *x;
        *x = *y;
        *y = temp;
    }

    void heapifyDown(int i) {
        int smallest = i;
        int l = leftChild(i);
        int r = rightChild(i);

        if (l < heap.size() && heap[l].priority < heap[smallest].priority)
            smallest = l;
        if (r < heap.size() && heap[r].priority < heap[smallest].priority)
            smallest = r;

        if (smallest != i) {
            swap(&heap[i], &heap[smallest]);
            heapifyDown(smallest);
        }
    }

    void heapifyUp(int i) {
        while (i != 0 && heap[parent(i)].priority > heap[i].priority) {
            swap(&heap[i], &heap[parent(i)]);
            i = parent(i);
        }
    }

public:
    void push(double priority, int data) {
        heap.push_back({priority, data});
        heapifyUp(heap.size() - 1);
    }

    HeapPair pop() {
        if (heap.size() <= 0) return {-1.0, -1};
        if (heap.size() == 1) {
            HeapPair root = heap[0];
            heap.resize(0);
            return root;
        }

        HeapPair root = heap[0];
        heap[0] = heap[heap.size() - 1];
        heap.resize(heap.size() - 1);
        heapifyDown(0);

        return root;
    }
    
    HeapPair top() const {
        return heap[0];
    }

    bool empty() const {
        return heap.size() == 0;
    }
};

#endif
